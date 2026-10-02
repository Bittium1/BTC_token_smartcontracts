pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Claimable.sol";
import "openzeppelin-solidity/contracts/ownership/CanReclaimToken.sol";


// Preserve the inheritance helper while explicitly rejecting Ether at deployment.
contract OwnableContract is CanReclaimToken, Claimable {
    // Keep deployments non-payable without adding an Ether-reclaim API.
    constructor() public payable {
        require(msg.value == 0);
    }
}
