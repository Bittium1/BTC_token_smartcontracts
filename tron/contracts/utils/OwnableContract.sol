pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Claimable.sol";
import "openzeppelin-solidity/contracts/ownership/CanReclaimToken.sol";


// Preserve the inheritance helper while explicitly rejecting native value at deployment.
contract OwnableContract is CanReclaimToken, Claimable {
    constructor() public payable {
        require(msg.value == 0);
    }
}
