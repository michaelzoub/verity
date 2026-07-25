// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../src/ChallengeEscrow.sol";
contract ChallengeEscrowTest {
    function testStoresScoreAsBasisPoints() external {
        ChallengeEscrow escrow = new ChallengeEscrow{value: 1 ether}(8750, 50, uint64(block.timestamp + 1 days), address(this), bytes32("grader"));
        require(escrow.minimumScore() == 8750, "basis points");
        escrow.finalize(bytes32("submission"), address(0xBEEF), 8750);
        require(escrow.paid(), "pays at threshold");
    }
}
