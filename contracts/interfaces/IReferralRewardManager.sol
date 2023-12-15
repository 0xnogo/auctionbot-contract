// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReferralRewardManager {
    function codeToAddress(
        string calldata _code
    ) external view returns (address);

    function addressToCode(
        address _account
    ) external view returns (string memory);

    function registerCode(string calldata _code) external;

    function addToBalance(
        string calldata referralCode,
        uint256 _amount,
        address _token
    ) external;

    function isCodeRegistered(
        string calldata _code
    ) external view returns (bool);

    function referralCodeOwner(
        string calldata referralCode
    ) external view returns (address);

    event Withdraw(address indexed account, uint256 amount, address token);
    event BalanceIncrease(
        address indexed account,
        uint256 amount,
        address token
    );
    event CodeRegistered(address indexed account, string code);
}
