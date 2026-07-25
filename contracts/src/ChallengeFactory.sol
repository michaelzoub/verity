// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ChallengeEscrow.sol";

/// @notice Deploys one independently funded escrow per immutable challenge id.
contract ChallengeFactory {
    mapping(bytes32 => address) public escrowForChallenge;

    event ChallengeDeployed(
        bytes32 indexed challengeId,
        address indexed escrow,
        address indexed requester,
        uint256 reward,
        uint256 passingScore,
        uint64 deadline,
        uint32 maxSubmissions,
        address authorizedBackend,
        bytes32 graderCommitment,
        uint32 graderVersion
    );

    error ChallengeAlreadyExists();
    error InvalidChallenge();

    function createChallenge(
        bytes32 challengeId,
        uint256 passingScore,
        uint32 maxSubmissions,
        uint64 deadline,
        address authorizedBackend,
        bytes32 graderCommitment,
        uint32 graderVersion
    ) external payable returns (address escrow) {
        if (challengeId == bytes32(0) || escrowForChallenge[challengeId] != address(0)) {
            revert ChallengeAlreadyExists();
        }
        if (msg.value == 0) revert InvalidChallenge();
        escrow = address(
            new ChallengeEscrow{value: msg.value}(
                challengeId,
                payable(msg.sender),
                passingScore,
                maxSubmissions,
                deadline,
                authorizedBackend,
                graderCommitment,
                graderVersion
            )
        );
        escrowForChallenge[challengeId] = escrow;
        emit ChallengeDeployed(
            challengeId,
            escrow,
            msg.sender,
            msg.value,
            passingScore,
            deadline,
            maxSubmissions,
            authorizedBackend,
            graderCommitment,
            graderVersion
        );
    }
}
