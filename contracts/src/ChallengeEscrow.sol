// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Holds one funded reward and settles only authenticated grader results.
contract ChallengeEscrow {
    uint16 public immutable minimumScore;
    uint32 public immutable maxSubmissions;
    uint64 public immutable deadline;
    address public immutable requester;
    address public immutable authorizedBackend;
    bytes32 public immutable graderCommitment;
    uint32 public submissions;
    bool public paid;

    event ChallengeCreated(address indexed requester, uint256 reward, uint16 minimumScore, bytes32 graderCommitment);
    event SubmissionFinalized(bytes32 indexed submissionHash, address indexed agent, uint16 score, bool paid);

    error Unauthorized(); error Expired(); error CapacityReached(); error AlreadyPaid(); error InvalidScore(); error TransferFailed();

    constructor(uint16 _minimumScore, uint32 _maxSubmissions, uint64 _deadline, address _authorizedBackend, bytes32 _graderCommitment) payable {
        require(_minimumScore <= 10_000 && _maxSubmissions > 0 && _deadline > block.timestamp, "invalid challenge");
        minimumScore = _minimumScore; maxSubmissions = _maxSubmissions; deadline = _deadline;
        requester = msg.sender; authorizedBackend = _authorizedBackend; graderCommitment = _graderCommitment;
        emit ChallengeCreated(msg.sender, msg.value, _minimumScore, _graderCommitment);
    }

    function finalize(bytes32 submissionHash, address agent, uint16 score) external {
        if (msg.sender != authorizedBackend) revert Unauthorized();
        if (block.timestamp > deadline) revert Expired(); if (submissions >= maxSubmissions) revert CapacityReached();
        if (score > 10_000) revert InvalidScore(); unchecked { ++submissions; }
        bool shouldPay = score >= minimumScore && !paid;
        if (shouldPay) { paid = true; (bool ok,) = agent.call{value: address(this).balance}(""); if (!ok) revert TransferFailed(); }
        emit SubmissionFinalized(submissionHash, agent, score, shouldPay);
    }
}
