pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Claimable.sol";
import "openzeppelin-solidity/contracts/ownership/CanReclaimToken.sol";


contract OwnableContract is CanReclaimToken, Claimable {
    // Keep deployments non-payable without reintroducing HasNoEther's reclaim API.
    constructor() public payable {
        require(msg.value == 0);
    }
}
