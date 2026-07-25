// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../src/ChallengeEscrow.sol";
contract ChallengeEscrowTest {
    function testStoresArbitraryScaledTerms() external { ChallengeEscrow escrow = new ChallengeEscrow{value: 1 ether}(bytes32("challenge"), 40000, 50, uint64(block.timestamp + 1 days), address(this), bytes32("grader"), 1); require(escrow.passingScore() == 40000, "scaled score"); }
    function testDoesNotImposeUniversalMaximum() external { ChallengeEscrow escrow = new ChallengeEscrow{value: 1 ether}(bytes32("challenge"), type(uint256).max, 1, uint64(block.timestamp + 1 days), address(this), bytes32("grader"), 1); require(escrow.passingScore() == type(uint256).max, "unbounded"); }
}
