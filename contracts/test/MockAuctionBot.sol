// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockAuctionBot {
    using SafeERC20 for IERC20;

    IERC20 public immutable weth;
    uint256 public amount;

    constructor(IERC20 _weth) {
        weth = _weth;
    }

    function setAmount(uint256 _sumOfSellAmounts) external {
        amount = _sumOfSellAmounts;
    }

    function placeSellOrders(
        uint256 auctionId,
        uint96[] memory _minBuyAmounts,
        uint96[] memory _sellAmounts,
        bytes32[] memory _prevSellOrders,
        string calldata referralCode
    ) external returns (uint64 userId, uint256 sumOfSellAmounts) {
        return
            _placeSellOrders(
                auctionId,
                _minBuyAmounts,
                _sellAmounts,
                _prevSellOrders,
                msg.sender,
                referralCode
            );
    }

    function placeSellOrdersOnBehalf(
        uint256 auctionId,
        uint96[] memory _minBuyAmounts,
        uint96[] memory _sellAmounts,
        bytes32[] memory _prevSellOrders,
        address orderSubmitter,
        string calldata referralCode
    ) external returns (uint64 userId, uint256 sumOfSellAmounts) {
        return
            _placeSellOrders(
                auctionId,
                _minBuyAmounts,
                _sellAmounts,
                _prevSellOrders,
                orderSubmitter,
                referralCode
            );
    }

    function _placeSellOrders(
        uint256,
        uint96[] memory,
        uint96[] memory,
        bytes32[] memory,
        address,
        string calldata
    ) internal returns (uint64, uint256) {
        weth.safeTransferFrom(msg.sender, address(this), amount);

        return (0, amount);
    }
}
