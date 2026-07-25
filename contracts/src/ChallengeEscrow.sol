// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice One funded reward and one immutable private-grader commitment per challenge.
contract ChallengeEscrow {
    bytes32 public constant RESULT_TYPEHASH = keccak256(
        "Settlement(uint256 chainId,address verifyingContract,bytes32 challengeId,bytes32 submissionId,bytes32 submissionHash,address agent,uint256 score,bytes32 outcome,bytes32 graderCommitment,uint32 graderVersion,uint256 nonce,uint256 expiry)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    bytes32 public immutable DOMAIN_SEPARATOR;
    uint256 public immutable passingScore;
    uint32 public immutable maxSubmissions;
    uint64 public immutable deadline;
    address payable public immutable requester;
    address public authorizedBackend;
    bytes32 public immutable graderCommitment;
    uint32 public immutable graderVersion;
    bytes32 public immutable challengeId;

    uint32 public submissions;
    bool public paid;
    bool public refunded;
    mapping(bytes32 => bool) public finalized;
    mapping(uint256 => bool) public usedNonces;

    event ChallengeCreated(
        bytes32 indexed challengeId,
        address indexed requester,
        uint256 reward,
        uint256 passingScore,
        uint64 deadline,
        uint32 maxSubmissions,
        address authorizedBackend,
        bytes32 graderCommitment,
        uint32 graderVersion
    );
    event SubmissionFinalized(
        bytes32 indexed submissionId,
        bytes32 indexed submissionHash,
        address indexed agent,
        uint256 score,
        bytes32 outcome,
        bool paid,
        uint256 nonce
    );
    event ChallengeRefunded(bytes32 indexed challengeId, address indexed requester, uint256 amount);
    event AuthorizedBackendRotated(address indexed previousBackend, address indexed backend);

    error Unauthorized();
    error Expired();
    error NotExpired();
    error CapacityReached();
    error TransferFailed();
    error DuplicateSubmission();
    error InvalidAgent();
    error InvalidSignature();
    error NonceUsed();
    error InvalidExpiry();
    error InvalidChallenge();
    error AlreadyResolved();

    constructor(
        bytes32 _challengeId,
        address payable _requester,
        uint256 _passingScore,
        uint32 _maxSubmissions,
        uint64 _deadline,
        address _authorizedBackend,
        bytes32 _graderCommitment,
        uint32 _graderVersion
    ) payable {
        if (
            _challengeId == bytes32(0) || _requester == address(0) || _maxSubmissions == 0
                || _deadline <= block.timestamp || _authorizedBackend == address(0)
                || _graderCommitment == bytes32(0) || _graderVersion == 0 || msg.value == 0
        ) revert InvalidChallenge();
        challengeId = _challengeId;
        requester = _requester;
        passingScore = _passingScore;
        maxSubmissions = _maxSubmissions;
        deadline = _deadline;
        authorizedBackend = _authorizedBackend;
        graderCommitment = _graderCommitment;
        graderVersion = _graderVersion;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("Verity ChallengeEscrow"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
        emit ChallengeCreated(
            _challengeId,
            _requester,
            msg.value,
            _passingScore,
            _deadline,
            _maxSubmissions,
            _authorizedBackend,
            _graderCommitment,
            _graderVersion
        );
    }

    function rotateAuthorizedBackend(address backend) external {
        if (msg.sender != authorizedBackend || backend == address(0)) revert Unauthorized();
        address previous = authorizedBackend;
        authorizedBackend = backend;
        emit AuthorizedBackendRotated(previous, backend);
    }

    function finalize(
        bytes32 submissionId,
        bytes32 submissionHash,
        address payable agent,
        uint256 score,
        bytes32 outcome,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external {
        if (msg.sender != authorizedBackend) revert Unauthorized();
        if (block.timestamp > deadline) revert Expired();
        if (paid || refunded) revert AlreadyResolved();
        if (expiry < block.timestamp || expiry > deadline) revert InvalidExpiry();
        if (agent == address(0)) revert InvalidAgent();
        if (submissionId == bytes32(0) || submissionHash == bytes32(0)) revert InvalidChallenge();
        if (finalized[submissionId]) revert DuplicateSubmission();
        if (usedNonces[nonce]) revert NonceUsed();
        if (submissions >= maxSubmissions) revert CapacityReached();

        bytes32 structHash = keccak256(
            abi.encode(
                RESULT_TYPEHASH,
                block.chainid,
                address(this),
                challengeId,
                submissionId,
                submissionHash,
                agent,
                score,
                outcome,
                graderCommitment,
                graderVersion,
                nonce,
                expiry
            )
        );
        if (_recover(keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)), signature) != authorizedBackend) {
            revert InvalidSignature();
        }

        finalized[submissionId] = true;
        usedNonces[nonce] = true;
        unchecked {
            ++submissions;
        }
        bool shouldPay = score >= passingScore;
        if (shouldPay) {
            paid = true;
            uint256 amount = address(this).balance;
            (bool ok,) = agent.call{value: amount}("");
            if (!ok) revert TransferFailed();
        }
        emit SubmissionFinalized(submissionId, submissionHash, agent, score, outcome, shouldPay, nonce);
    }

    /// @notice Anyone may trigger an expired refund, but funds can only go to the immutable requester.
    function refundExpired() external {
        if (block.timestamp <= deadline) revert NotExpired();
        if (paid || refunded) revert AlreadyResolved();
        refunded = true;
        uint256 amount = address(this).balance;
        (bool ok,) = requester.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit ChallengeRefunded(challengeId, requester, amount);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER) return address(0);
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
