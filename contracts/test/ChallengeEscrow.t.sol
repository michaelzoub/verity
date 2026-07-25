// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../src/ChallengeFactory.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 selector) external;
}

contract ChallengeEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant BACKEND_KEY = 0xBEEF;
    bytes32 private constant CHALLENGE_ID = keccak256("challenge");
    bytes32 private constant GRADER = keccak256("grader");
    address private backend;
    address payable private requester;
    address payable private agent;
    ChallengeFactory private factory;

    receive() external payable {}

    function setUp() external {
        backend = vm.addr(BACKEND_KEY);
        requester = payable(vm.addr(0xCAFE));
        agent = payable(vm.addr(0xA11CE));
        vm.deal(requester, 10 ether);
        factory = new ChallengeFactory();
    }

    function _deploy(uint256 passing, uint64 deadline) private returns (ChallengeEscrow escrow) {
        vm.prank(requester);
        address deployed = factory.createChallenge{value: 1 ether}(
            CHALLENGE_ID, passing, 3, deadline, backend, GRADER, 1
        );
        return ChallengeEscrow(payable(deployed));
    }

    function _signature(
        ChallengeEscrow escrow,
        bytes32 submissionId,
        bytes32 submissionHash,
        uint256 score,
        uint256 nonce,
        uint256 expiry
    ) private returns (bytes memory) {
        return _signatureFor(escrow, submissionId, submissionHash, agent, score, keccak256("SCORED"), nonce, expiry);
    }

    function _signatureFor(
        ChallengeEscrow escrow,
        bytes32 submissionId,
        bytes32 submissionHash,
        address payout,
        uint256 score,
        bytes32 outcome,
        uint256 nonce,
        uint256 expiry
    ) private returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                escrow.RESULT_TYPEHASH(),
                block.chainid,
                address(escrow),
                CHALLENGE_ID,
                submissionId,
                submissionHash,
                payout,
                score,
                outcome,
                GRADER,
                uint32(1),
                nonce,
                expiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BACKEND_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function testFactoryPreservesRequesterAndFunding() external {
        ChallengeEscrow escrow = _deploy(375, uint64(block.timestamp + 1 days));
        require(escrow.requester() == requester, "requester");
        require(address(escrow).balance == 1 ether, "funding");
        require(factory.escrowForChallenge(CHALLENGE_ID) == address(escrow), "factory mapping");
    }

    function testPassingSettlementPaysVerifiedAgentExactlyOnce() external {
        uint256 deadline = block.timestamp + 1 days;
        ChallengeEscrow escrow = _deploy(375, uint64(deadline));
        bytes32 submissionId = keccak256("submission");
        bytes32 submissionHash = keccak256("payload");
        bytes memory signature = _signature(escrow, submissionId, submissionHash, 375, 7, deadline);
        uint256 beforeBalance = agent.balance;
        vm.prank(backend);
        escrow.finalize(
            submissionId, submissionHash, agent, 375, keccak256("SCORED"), 7, deadline, signature
        );
        require(agent.balance == beforeBalance + 1 ether, "payout");
        require(escrow.paid(), "paid");
        bytes32 otherId = keccak256("other");
        bytes memory otherSignature = _signature(escrow, otherId, submissionHash, 400, 8, deadline);
        vm.prank(backend);
        vm.expectRevert(ChallengeEscrow.AlreadyResolved.selector);
        escrow.finalize(
            otherId, submissionHash, agent, 400, keccak256("SCORED"), 8, deadline, otherSignature
        );
    }

    function testBelowThresholdFinalizesWithoutPayoutThenRefundsAfterExpiry() external {
        uint256 deadline = block.timestamp + 1 days;
        ChallengeEscrow escrow = _deploy(375, uint64(deadline));
        bytes32 submissionId = keccak256("submission");
        bytes32 submissionHash = keccak256("payload");
        bytes memory signature = _signature(escrow, submissionId, submissionHash, 374, 9, deadline);
        vm.prank(backend);
        escrow.finalize(
            submissionId,
            submissionHash,
            agent,
            374,
            keccak256("SCORED"),
            9,
            deadline,
            signature
        );
        require(!escrow.paid() && address(escrow).balance == 1 ether, "no payout");
        vm.expectRevert(ChallengeEscrow.NotExpired.selector);
        escrow.refundExpired();
        uint256 beforeBalance = requester.balance;
        vm.warp(deadline + 1);
        escrow.refundExpired();
        require(requester.balance == beforeBalance + 1 ether, "refund");
        require(escrow.refunded(), "refunded");
    }

    function testRejectsDuplicateChallengeAndEarlyRefundRace() external {
        uint256 deadline = block.timestamp + 1 days;
        ChallengeEscrow escrow = _deploy(1, uint64(deadline));
        vm.prank(requester);
        vm.expectRevert(ChallengeFactory.ChallengeAlreadyExists.selector);
        factory.createChallenge{value: 1 ether}(CHALLENGE_ID, 1, 1, uint64(deadline), backend, GRADER, 1);
        vm.expectRevert(ChallengeEscrow.NotExpired.selector);
        escrow.refundExpired();
    }

    function testCompanyCannotReplaceTrustedSettlementBackend() external {
        ChallengeEscrow escrow = _deploy(1, uint64(block.timestamp + 1 days));
        vm.prank(requester);
        vm.expectRevert(ChallengeEscrow.Unauthorized.selector);
        escrow.rotateAuthorizedBackend(requester);
        vm.prank(backend);
        escrow.rotateAuthorizedBackend(address(this));
        require(escrow.authorizedBackend() == address(this), "backend rotation");
    }

    function testRejectsInvalidSignatureAndWrongSolver() external {
        uint256 expiry = block.timestamp + 1 days;
        ChallengeEscrow escrow = _deploy(1, uint64(expiry));
        bytes32 submissionId = keccak256("submission");
        bytes32 submissionHash = keccak256("payload");

        bytes memory valid = _signature(escrow, submissionId, submissionHash, 1, 1, expiry);
        valid[0] = bytes1(uint8(valid[0]) ^ 1);
        vm.prank(backend);
        vm.expectRevert(ChallengeEscrow.InvalidSignature.selector);
        escrow.finalize(submissionId, submissionHash, agent, 1, keccak256("SCORED"), 1, expiry, valid);

        address payable wrongSolver = payable(vm.addr(0xBAD));
        bytes memory agentSignature = _signature(escrow, submissionId, submissionHash, 1, 2, expiry);
        vm.prank(backend);
        vm.expectRevert(ChallengeEscrow.InvalidSignature.selector);
        escrow.finalize(submissionId, submissionHash, wrongSolver, 1, keccak256("SCORED"), 2, expiry, agentSignature);

    }

    function testRejectsNonScoredOutcome() external {
        uint256 expiry = block.timestamp + 1 days;
        ChallengeEscrow escrow = _deploy(1, uint64(expiry));
        bytes32 submissionId = keccak256("submission");
        bytes32 submissionHash = keccak256("payload");
        bytes32 invalidOutcome = keccak256("GRADER_ERROR");
        bytes memory signature =
            _signatureFor(escrow, submissionId, submissionHash, agent, 1, invalidOutcome, 3, expiry);
        vm.prank(backend);
        vm.expectRevert(ChallengeEscrow.InvalidOutcome.selector);
        escrow.finalize(submissionId, submissionHash, agent, 1, invalidOutcome, 3, expiry, signature);
    }

    function testRejectsSubmissionAndNonceReplay() external {
        uint256 deadline = block.timestamp + 1 days;
        ChallengeEscrow escrow = _deploy(10, uint64(deadline));
        bytes32 firstId = keccak256("first");
        bytes32 firstHash = keccak256("payload-one");
        bytes memory first = _signature(escrow, firstId, firstHash, 1, 7, deadline);
        vm.prank(backend);
        escrow.finalize(firstId, firstHash, agent, 1, keccak256("SCORED"), 7, deadline, first);

        bytes memory duplicate = _signature(escrow, firstId, firstHash, 1, 8, deadline);
        vm.prank(backend);
        vm.expectRevert(ChallengeEscrow.DuplicateSubmission.selector);
        escrow.finalize(firstId, firstHash, agent, 1, keccak256("SCORED"), 8, deadline, duplicate);

        bytes32 secondId = keccak256("second");
        bytes memory replayNonce = _signature(escrow, secondId, keccak256("payload-two"), 1, 7, deadline);
        vm.prank(backend);
        vm.expectRevert(ChallengeEscrow.NonceUsed.selector);
        escrow.finalize(secondId, keccak256("payload-two"), agent, 1, keccak256("SCORED"), 7, deadline, replayNonce);

    }

    function testRejectsExpiredFinalize() external {
        uint256 deadline = block.timestamp + 1 days;
        ChallengeEscrow escrow = _deploy(10, uint64(deadline));
        bytes32 submissionId = keccak256("expired-submission");
        bytes32 submissionHash = keccak256("expired-payload");
        bytes memory signature = _signature(escrow, submissionId, submissionHash, 10, 9, deadline);
        vm.warp(deadline + 1);
        vm.prank(backend);
        vm.expectRevert(ChallengeEscrow.Expired.selector);
        escrow.finalize(submissionId, submissionHash, agent, 10, keccak256("SCORED"), 9, deadline, signature);
    }
}
