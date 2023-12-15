// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IReferralRewardManager.sol";

/**
 * @title ReferralRewardManager
 * This is the contract that handles the referral rewards
 */
contract ReferralRewardManager is
    IReferralRewardManager,
    ReentrancyGuard,
    Ownable
{
    using SafeERC20 for IERC20;

    mapping(string => address) public override codeToAddress;
    mapping(address => string) public override addressToCode;

    mapping(address => mapping(address => uint256)) public balances;

    address public auctionBot;

    bool public withdrawOpen = false;

    constructor() ReentrancyGuard() Ownable() {}

    modifier onlyOwnerOrAuction() {
        require(
            msg.sender == owner() || msg.sender == auctionBot,
            "ReferralRewardManager: unauthorized"
        );
        _;
    }

    function isCodeRegistered(
        string memory _code
    ) public view override returns (bool) {
        return codeToAddress[_code] != address(0);
    }

    function referralCodeOwner(
        string memory referralCode
    ) public view override returns (address) {
        return codeToAddress[referralCode];
    }

    function registerCode(string memory _code) public override {
        require(
            bytes(_code).length > 0,
            "ReferralRewardManager: code cannot be empty"
        );
        require(
            bytes(_code).length <= 8,
            "ReferralRewardManager: code cannot be above 8"
        );

        require(
            codeToAddress[_code] == address(0),
            "ReferralRewardManager: code already registered or address already has code"
        );

        codeToAddress[_code] = msg.sender;
        addressToCode[msg.sender] = _code;

        emit CodeRegistered(msg.sender, _code);
    }

    function addToBalance(
        string memory _referralCode,
        uint256 _amount,
        address _token
    ) public override onlyOwnerOrAuction {
        require(
            isCodeRegistered(_referralCode),
            "ReferralRewardManager: code not registered"
        );

        address account = codeToAddress[_referralCode];

        balances[account][_token] = balances[account][_token] + _amount;

        emit BalanceIncrease(account, _amount, _token);
    }

    function withdraw(uint256 _amount, address _token) public nonReentrant {
        require(withdrawOpen, "ReferralRewardManager: withdraw not open");
        require(_amount > 0, "ReferralRewardManager: amount cannot be 0");
        require(
            balances[msg.sender][_token] >= _amount,
            "ReferralRewardManager: insufficient balance"
        );

        balances[msg.sender][_token] = balances[msg.sender][_token] - (_amount);
        IERC20(_token).safeTransfer(msg.sender, _amount);

        emit Withdraw(msg.sender, _amount, _token);
    }

    function adminOverride(
        address _account,
        string memory _code
    ) public onlyOwner {
        delete codeToAddress[addressToCode[_account]];

        codeToAddress[_code] = _account;
        addressToCode[_account] = _code;

        emit CodeRegistered(_account, _code);
    }

    function setAuctionBot(address _auction) public onlyOwner {
        auctionBot = _auction;
    }

    function openWithdraw() public onlyOwner {
        withdrawOpen = true;
    }

    // receive eth
    receive() external payable {}
}
