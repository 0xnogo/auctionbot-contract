pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAuctionBot.sol";
import "../interfaces/IWETH.sol";

contract DepositAndPlaceOrder {
    IAuctionBot public immutable easyAuction;
    IWETH public immutable nativeTokenWrapper;

    constructor(IAuctionBot _easyAuction, address _nativeTokenWrapper) {
        nativeTokenWrapper = IWETH(_nativeTokenWrapper);
        easyAuction = _easyAuction;
        IERC20(_nativeTokenWrapper).approve(
            address(_easyAuction),
            type(uint256).max
        );
    }

    function depositAndPlaceOrder(
        uint256 auctionId,
        uint96[] calldata _minBuyAmounts,
        bytes32[] calldata _prevSellOrders,
        string calldata referralCode
    ) external payable returns (uint64) {
        uint96[] memory sellAmounts = new uint96[](1);
        require(msg.value < 2 ** 96, "too much value sent");

        nativeTokenWrapper.deposit{value: msg.value}();

        sellAmounts[0] = uint96(msg.value);
        (uint64 userId, uint256 sumOfSellAmounts) = easyAuction
            .placeSellOrdersOnBehalf(
                auctionId,
                _minBuyAmounts,
                sellAmounts,
                _prevSellOrders,
                msg.sender,
                referralCode
            );

        if (msg.value > sumOfSellAmounts) {
            uint256 remainingBalance = msg.value - sumOfSellAmounts;
            // wrap the remaining balance
            nativeTokenWrapper.withdraw(remainingBalance);
            // transfer the remaining balance to the user
            // slither-disable-next-line arbitrary-send-eth
            (bool success, ) = msg.sender.call{value: remainingBalance}("");
            require(success, "DepositAndPlaceOrder: transfer failed");
        }

        return userId;
    }

    receive() external payable {
        // only from nativeTokenWrapper
        require(
            msg.sender == address(nativeTokenWrapper),
            "DepositAndPlaceOrder: only nativeTokenWrapper"
        );
    }
}
