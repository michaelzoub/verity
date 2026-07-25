// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../src/ChallengeEscrow.sol";
contract ChallengeEscrowTest {
    function testStoresTermsAndDomain() external {
        ChallengeEscrow escrow = new ChallengeEscrow{value: 1 ether}(bytes32("challenge"), 8750, 50, uint64(block.timestamp + 1 days), address(this), bytes32("grader"), 1);
        require(escrow.minimumScore() == 8750, "basis points");
        require(escrow.graderVersion() == 1, "version");
        require(escrow.DOMAIN_SEPARATOR() != bytes32(0), "domain");
    }
}
