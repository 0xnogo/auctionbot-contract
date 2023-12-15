// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract ERC20Factory {
    // Event to log the address of the deployed ERC20 contract.
    event ERC20Deployed(
        address indexed deployer,
        address indexed erc20Address,
        string name,
        string symbol,
        uint256 initialAmount
    );

    /**
     * @dev Deploy a new ERC20 token with the specified name, symbol, decimals, and initial amount.
     * @param name Name of the ERC20 token.
     * @param symbol Symbol of the ERC20 token.
     * @param initialAmount Initial supply of the token. Will be minted to the caller.
     * @return newERC20 Address of the newly deployed ERC20 token.
     */
    function deployERC20(
        string memory name,
        string memory symbol,
        uint256 initialAmount
    ) external returns (address newERC20) {
        CustomERC20 token = new CustomERC20(
            name,
            symbol,
            initialAmount,
            msg.sender
        );
        emit ERC20Deployed(
            msg.sender,
            address(token),
            name,
            symbol,
            initialAmount
        );
        return address(token);
    }
}

contract CustomERC20 is ERC20Capped {
    constructor(
        string memory name,
        string memory symbol,
        uint256 cap,
        address initialHolder
    ) ERC20(name, symbol) ERC20Capped(cap) {
        _mint(initialHolder, cap);
    }

    function _mint(address account, uint256 amount) internal override {
        super._mint(account, amount);
    }
}
