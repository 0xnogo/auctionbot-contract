pragma solidity >=0.6.8;

import "./ERC20FixedSupply.sol";

contract ERC20Deployer {
    function deployToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) public {
        new ERC20FixedSupply(name, symbol, totalSupply, msg.sender);
    }
}
