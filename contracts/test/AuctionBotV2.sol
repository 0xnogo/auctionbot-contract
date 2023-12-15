// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "../interfaces/IAuctionBot.sol";
import "../interfaces/IReferralRewardManager.sol";
import "../interfaces/IUniswapV2Router02.sol";
import "../interfaces/IWETH.sol";
import "../libraries/IterableOrderedOrderSet.sol";
import "../libraries/IdToAddressBiMap.sol";
import "../libraries/SafeCast.sol";
import "../strategies/interfaces/IStrategyManager.sol";
import "../AuctionBot.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract AuctionBotV2 is
    IAuctionBot,
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;
    using SafeCast for uint256;
    using IterableOrderedOrderSet for IterableOrderedOrderSet.Data;
    using IterableOrderedOrderSet for bytes32;
    using IdToAddressBiMap for IdToAddressBiMap.Data;

    modifier atStageOrderPlacement(uint256 auctionId) {
        require(
            (block.timestamp < auctionData[auctionId].auctionEndDate),
            "E1"
        );
        _;
    }

    modifier atStageOrderPlacementAndCancelation(uint256 auctionId) {
        require(
            (block.timestamp < auctionData[auctionId].orderCancellationEndDate),
            "E2"
        );
        _;
    }

    modifier atStageSolutionSubmission(uint256 auctionId) {
        {
            uint256 auctionEndDate = auctionData[auctionId].auctionEndDate;
            require(
                (auctionEndDate != 0 &&
                    block.timestamp >= auctionEndDate &&
                    auctionData[auctionId].clearingPriceOrder == bytes32(0)),
                "E3"
            );
        }
        _;
    }

    modifier atStageFinished(uint256 auctionId) {
        require(
            (auctionData[auctionId].clearingPriceOrder != bytes32(0)),
            "E4"
        );
        _;
    }

    mapping(uint256 => uint256) public auctionToStrategy;
    mapping(uint256 => uint256) public referralFeeNumerator;
    mapping(uint256 => mapping(bytes32 => string)) public referrals;
    mapping(uint256 => IterableOrderedOrderSet.Data) internal sellOrders;
    mapping(uint256 => AuctionData) public auctionData;
    mapping(address => bool) public biddingTokenWhitelist;

    IdToAddressBiMap.Data private registeredUsers;
    uint64 public numUsers;
    uint256 public auctionCounter;

    uint256 public constant FEE_DENOMINATOR = 1000;
    uint64 public feeReceiverUserId;
    Fees public fees;

    IReferralRewardManager public referralRewardManager;
    IStrategyManager public strategyManager;
    IUniswapV2Router02 public uniswapV2Router;

    AggregatorV3Interface internal priceFeed;

    bool public upgradedToV2;
    uint256 public v2Uint;

    error EthSendingFailed();

    function initialize(
        IReferralRewardManager _referralRewardManager,
        IStrategyManager _strategyManager,
        address _feeReceiverAddress,
        Fees memory _fees,
        IUniswapV2Router02 _uniswapV2Router,
        AggregatorV3Interface _priceFeed,
        address[] memory _biddingTokenWhitelist
    ) external initializer {
        require((address(_referralRewardManager) != address(0)), "E5");

        __Ownable_init();
        referralRewardManager = _referralRewardManager;
        strategyManager = _strategyManager;
        setFeeParameters(_fees, _feeReceiverAddress);

        uniswapV2Router = _uniswapV2Router;

        priceFeed = _priceFeed;

        for (uint256 i = 0; i < _biddingTokenWhitelist.length; i++) {
            biddingTokenWhitelist[_biddingTokenWhitelist[i]] = true;
        }
    }

    function initializeV2(uint256 _v2Uint) external {
        require(!upgradedToV2, "V2 already initialized");

        v2Uint = _v2Uint;
    }

    receive() external payable {}

    ///@dev required by the OZ UUPS module
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setFeeParameters(
        Fees memory _fees,
        address newfeeReceiverAddress
    ) public onlyOwner {
        // caution: for currently running auctions, the feeReceiverUserId is changing as well.
        feeReceiverUserId = getUserId(newfeeReceiverAddress);
        fees = _fees;
    }

    function addBiddingTokenToWhitelist(address tokenAddress) public onlyOwner {
        biddingTokenWhitelist[tokenAddress] = true;
    }

    function removeBiddingTokenFromWhitelist(
        address tokenAddress
    ) public onlyOwner {
        biddingTokenWhitelist[tokenAddress] = false;
    }

    function initiateAuction(
        InitParams memory params
    ) public returns (uint256) {
        // withdraws sellAmount
        if (params._strategyId != 0) {
            params._auctioningToken.safeTransferFrom(
                msg.sender,
                address(this),
                params._auctionedSellAmount
            );
        }
        auctionCounter = auctionCounter.add(1);
        if (params._strategyId > 1) {
            StrategyData memory strategy = strategyManager.getStrategy(
                params._strategyId
            );
            require(strategy.enabled, "E7");
            strategy.strategyContract.init(
                auctionCounter,
                address(params._auctioningToken),
                params._strategyInitParams
            );
        }

        require((params._referralFeeNumerator <= 100), "E8");
        require((params._auctionedSellAmount > 0), "E9");
        require((params._minBuyAmount > 0), "E10");
        require((params._minimumBiddingAmountPerOrder > 0), "E11");
        require(
            (params._orderCancellationEndDate <= params._auctionEndDate),
            "E12"
        );
        require((params._auctionEndDate > block.timestamp), "E13");
        require(
            ((params._strategyId == 0 && msg.sender == owner()) ||
                params._strategyId > 0),
            "E14"
        );
        require((biddingTokenWhitelist[address(params._biddingToken)]), "E26");

        sellOrders[auctionCounter].initializeEmptyList();
        uint64 userId = getUserId(msg.sender);
        auctionData[auctionCounter] = AuctionData(
            params._auctioningToken,
            params._biddingToken,
            params._orderCancellationEndDate,
            params._auctionEndDate,
            IterableOrderedOrderSet.encodeOrder(
                userId,
                params._minBuyAmount,
                params._auctionedSellAmount
            ),
            params._minimumBiddingAmountPerOrder,
            0,
            IterableOrderedOrderSet.QUEUE_START,
            bytes32(0),
            0,
            false,
            params._minFundingThreshold
        );
        auctionToStrategy[auctionCounter] = params._strategyId;
        referralFeeNumerator[auctionCounter] = params._referralFeeNumerator;
        emit NewAuction(
            auctionCounter,
            params._auctioningToken,
            params._biddingToken,
            params._orderCancellationEndDate,
            params._auctionEndDate,
            userId,
            params._auctionedSellAmount,
            params._minBuyAmount,
            params._minimumBiddingAmountPerOrder,
            params._minFundingThreshold
        );
        return auctionCounter;
    }

    function placeSellOrders(
        uint256 auctionId,
        uint96[] calldata _minBuyAmounts,
        uint96[] calldata _sellAmounts,
        bytes32[] calldata _prevSellOrders,
        string calldata referralCode
    )
        external
        atStageOrderPlacement(auctionId)
        returns (uint64 userId, uint256 sumOfSellAmounts)
    {
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
        uint96[] calldata _minBuyAmounts,
        uint96[] calldata _sellAmounts,
        bytes32[] calldata _prevSellOrders,
        address orderSubmitter,
        string calldata referralCode
    )
        external
        atStageOrderPlacement(auctionId)
        returns (uint64 userId, uint256 sumOfSellAmounts)
    {
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
        uint256 auctionId,
        uint96[] memory _minBuyAmounts,
        uint96[] memory _sellAmounts,
        bytes32[] memory _prevSellOrders,
        address orderSubmitter,
        string memory referralCode
    ) internal returns (uint64 userId, uint256 sumOfSellAmounts) {
        {
            (
                ,
                uint96 buyAmountOfInitialAuctionOrder,
                uint96 sellAmountOfInitialAuctionOrder
            ) = auctionData[auctionId].initialAuctionOrder.decodeOrder();
            for (uint256 i = 0; i < _minBuyAmounts.length; i++) {
                require(
                    _minBuyAmounts[i].mul(buyAmountOfInitialAuctionOrder) <
                        sellAmountOfInitialAuctionOrder.mul(_sellAmounts[i]),
                    "E16"
                );
            }
        }
        userId = getUserId(orderSubmitter);
        uint256 minimumBiddingAmountPerOrder = auctionData[auctionId]
            .minimumBiddingAmountPerOrder;
        for (uint256 i = 0; i < _minBuyAmounts.length; i++) {
            require((_minBuyAmounts[i] > 0), "E15");
            // orders should have a minimum bid size in order to limit the gas
            // required to compute the final price of the auction.
            require((_sellAmounts[i] > minimumBiddingAmountPerOrder), "E17");
            bytes32 encodedOrder = IterableOrderedOrderSet.encodeOrder(
                userId,
                _minBuyAmounts[i],
                _sellAmounts[i]
            );
            if (
                sellOrders[auctionId].insert(encodedOrder, _prevSellOrders[i])
            ) {
                if (bytes(referralCode).length != 0) {
                    require(
                        (referralRewardManager.isCodeRegistered(referralCode)),
                        "E18"
                    );
                    require(
                        (referralRewardManager.referralCodeOwner(
                            referralCode
                        ) != orderSubmitter),
                        "E19"
                    );
                    referrals[auctionId][encodedOrder] = referralCode;
                }
                sumOfSellAmounts = sumOfSellAmounts.add(_sellAmounts[i]);
                emit NewSellOrder(
                    auctionId,
                    userId,
                    _minBuyAmounts[i],
                    _sellAmounts[i],
                    referralCode
                );
            }
        }
        auctionData[auctionId].biddingToken.safeTransferFrom(
            msg.sender,
            address(this),
            sumOfSellAmounts
        ); //[1]
    }

    function cancelSellOrders(
        uint256 auctionId,
        bytes32[] memory _sellOrders
    ) public atStageOrderPlacementAndCancelation(auctionId) {
        uint64 userId = getUserId(msg.sender);
        uint256 claimableAmount = 0;
        for (uint256 i = 0; i < _sellOrders.length; i++) {
            // Note: we keep the back pointer of the deleted element so that
            // it can be used as a reference point to insert a new node.
            delete referrals[auctionId][_sellOrders[i]];
            bool success = sellOrders[auctionId].removeKeepHistory(
                _sellOrders[i]
            );
            if (success) {
                (
                    uint64 userIdOfIter,
                    uint96 buyAmountOfIter,
                    uint96 sellAmountOfIter
                ) = _sellOrders[i].decodeOrder();
                require((userIdOfIter == userId), "E22");
                claimableAmount = claimableAmount.add(sellAmountOfIter);
                emit CancellationSellOrder(
                    auctionId,
                    userId,
                    buyAmountOfIter,
                    sellAmountOfIter
                );
            }
        }

        auctionData[auctionId].biddingToken.safeTransfer(
            msg.sender,
            claimableAmount
        ); //[2]
    }

    function precalculateSellAmountSum(
        uint256 auctionId,
        uint256 iterationSteps
    ) public atStageSolutionSubmission(auctionId) {
        (, , uint96 auctioneerSellAmount) = auctionData[auctionId]
            .initialAuctionOrder
            .decodeOrder();
        uint256 sumBidAmount = auctionData[auctionId].interimSumBidAmount;
        bytes32 iterOrder = auctionData[auctionId].interimOrder;
        for (uint256 i = 0; i < iterationSteps; i++) {
            iterOrder = sellOrders[auctionId].next(iterOrder);
            (, , uint96 sellAmountOfIter) = iterOrder.decodeOrder();
            sumBidAmount = sumBidAmount.add(sellAmountOfIter);
        }
        require((iterOrder != IterableOrderedOrderSet.QUEUE_END), "E20");
        // it is checked that not too many iteration steps were taken:
        // require that the sum of SellAmounts times the price of the last order
        // is not more than initially sold amount
        (, uint96 buyAmountOfIter, uint96 sellAmountOfIter) = iterOrder
            .decodeOrder();
        require(
            sumBidAmount.mul(buyAmountOfIter) <
                auctioneerSellAmount.mul(sellAmountOfIter),
            "E21"
        );
        auctionData[auctionId].interimSumBidAmount = sumBidAmount;
        auctionData[auctionId].interimOrder = iterOrder;
    }

    // @dev function settling the auction and calculating the price
    function settleAuction(
        uint256 auctionId
    )
        public
        atStageSolutionSubmission(auctionId)
        returns (bytes32 clearingOrder)
    {
        (
            uint64 auctioneerId,
            uint96 minAuctionedBuyAmount,
            uint96 fullAuctionedAmount
        ) = auctionData[auctionId].initialAuctionOrder.decodeOrder();
        uint256 currentBidSum = auctionData[auctionId].interimSumBidAmount;
        bytes32 currentOrder = auctionData[auctionId].interimOrder;
        uint256 buyAmountOfIter;
        uint256 sellAmountOfIter;
        uint96 fillVolumeOfAuctioneerOrder = fullAuctionedAmount;
        // Sum order up, until fullAuctionedAmount is fully bought or queue end is reached
        do {
            bytes32 nextOrder = sellOrders[auctionId].next(currentOrder);
            if (nextOrder == IterableOrderedOrderSet.QUEUE_END) {
                break;
            }
            currentOrder = nextOrder;
            (, buyAmountOfIter, sellAmountOfIter) = currentOrder.decodeOrder();
            currentBidSum = currentBidSum.add(sellAmountOfIter);
        } while (
            currentBidSum.mul(buyAmountOfIter) <
                fullAuctionedAmount.mul(sellAmountOfIter)
        );
        if (
            currentBidSum > 0 &&
            currentBidSum.mul(buyAmountOfIter) >=
            fullAuctionedAmount.mul(sellAmountOfIter)
        ) {
            // All considered/summed orders are sufficient to close the auction fully
            // at price between current and previous orders.
            uint256 uncoveredBids = currentBidSum.sub(
                fullAuctionedAmount.mul(sellAmountOfIter).div(buyAmountOfIter)
            );
            if (sellAmountOfIter >= uncoveredBids) {
                //[13]
                // Auction fully filled via partial match of currentOrder
                uint256 sellAmountClearingOrder = sellAmountOfIter.sub(
                    uncoveredBids
                );
                auctionData[auctionId]
                    .volumeClearingPriceOrder = sellAmountClearingOrder
                    .toUint96();
                currentBidSum = currentBidSum.sub(uncoveredBids);
                clearingOrder = currentOrder;
            } else {
                //[14]
                // Auction fully filled via price strictly between currentOrder and the order
                // immediately before. For a proof, see the security-considerations.md
                currentBidSum = currentBidSum.sub(sellAmountOfIter);
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    currentBidSum.toUint96()
                );
            }
        } else {
            // All considered/summed orders are not sufficient to close the auction fully at price of last order //[18]
            // Either a higher price must be used or auction is only partially filled
            if (currentBidSum > minAuctionedBuyAmount) {
                //[15]
                // Price higher than last order would fill the auction
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    currentBidSum.toUint96()
                );
            } else {
                //[16]
                // Even at the initial auction price, the auction is partially filled
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    minAuctionedBuyAmount
                );
                fillVolumeOfAuctioneerOrder = currentBidSum
                    .mul(fullAuctionedAmount)
                    .div(minAuctionedBuyAmount)
                    .toUint96();
            }
        }
        auctionData[auctionId].clearingPriceOrder = clearingOrder;
        if (auctionData[auctionId].minFundingThreshold > currentBidSum) {
            auctionData[auctionId].minFundingThresholdNotReached = true;
        }
        processFeesAndAuctioneerFunds(
            auctionId,
            fillVolumeOfAuctioneerOrder,
            auctioneerId,
            fullAuctionedAmount
        );
        {
            (
                uint64 userId,
                uint96 buyAmount,
                uint96 sellAmount
            ) = IterableOrderedOrderSet.decodeOrder(clearingOrder);
            emit AuctionCleared(
                auctionId,
                userId,
                buyAmount,
                sellAmount,
                fillVolumeOfAuctioneerOrder,
                uint96(currentBidSum)
            );
        }

        // Gas refunds
        auctionData[auctionId].initialAuctionOrder = bytes32(0);
        auctionData[auctionId].interimOrder = bytes32(0);
        auctionData[auctionId].interimSumBidAmount = uint256(0);
        auctionData[auctionId].minimumBiddingAmountPerOrder = uint256(0);
    }

    function claimFromParticipantOrders(
        uint256 auctionId,
        bytes32[] memory orders
    )
        external
        atStageFinished(auctionId)
        returns (
            uint256 sumAuctioningTokenAmount,
            uint256 sumBiddingTokenAmount
        )
    {
        (uint64 userId, , ) = orders[0].decodeOrder();
        for (uint256 index = 0; index < orders.length; index++) {
            (uint64 userIdOrder, , ) = orders[index].decodeOrder();
            require((userIdOrder == userId), "E23");
            (
                uint256 auctioningTokenAmount,
                uint256 biddingTokenAmount
            ) = _claimFromParticipantOrder(auctionId, orders[index]);
            sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                auctioningTokenAmount
            );
            sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                biddingTokenAmount
            );
        }
        uint256 strategyId = auctionToStrategy[auctionId];
        if (sumAuctioningTokenAmount > 0 && strategyId > 1) {
            address userAddress = registeredUsers.getAddressAt(userId);
            IStrategy strategy = strategyManager
                .getStrategy(strategyId)
                .strategyContract;
            IERC20(auctionData[auctionId].auctioningToken).transfer(
                address(strategy),
                sumAuctioningTokenAmount
            );
            strategy.execute(
                sumAuctioningTokenAmount,
                address(auctionData[auctionId].auctioningToken),
                auctionId,
                userAddress
            );
            sumAuctioningTokenAmount = 0;
        }
        sendOutTokens(
            auctionId,
            sumAuctioningTokenAmount,
            sumBiddingTokenAmount,
            userId
        );
    }

    function _claimFromParticipantOrder(
        uint256 auctionId,
        bytes32 order
    )
        internal
        returns (
            uint256 sumAuctioningTokenAmount,
            uint256 sumBiddingTokenAmount
        )
    {
        require((sellOrders[auctionId].remove(order)), "E24");
        AuctionData memory auction = auctionData[auctionId];
        (, uint96 priceNumerator, uint96 priceDenominator) = auction
            .clearingPriceOrder
            .decodeOrder();
        bool minFundingThresholdNotReached = auction
            .minFundingThresholdNotReached;
        (uint64 userId, uint96 buyAmount, uint96 sellAmount) = order
            .decodeOrder();
        string memory referralCode;
        uint256 referralFee;
        if (minFundingThresholdNotReached) {
            //[10]
            sumBiddingTokenAmount = sumBiddingTokenAmount.add(sellAmount);
        } else {
            //[23]
            if (order == auction.clearingPriceOrder) {
                //[25]
                sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                    auction.volumeClearingPriceOrder.mul(priceNumerator).div(
                        priceDenominator
                    )
                );
                sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                    sellAmount.sub(auction.volumeClearingPriceOrder)
                );
            } else {
                if (order.smallerThan(auction.clearingPriceOrder)) {
                    //[17]
                    sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                        sellAmount.mul(priceNumerator).div(priceDenominator)
                    );
                } else {
                    //[24]
                    sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                        sellAmount
                    );
                }
            }
        }
        {
            if (sumAuctioningTokenAmount > 0) {
                (referralCode, referralFee) = registerReferralEarnings(
                    sellAmount,
                    auctionId,
                    order
                );
            }
            sumBiddingTokenAmount = sumBiddingTokenAmount.sub(referralFee);
            emit ClaimedFromOrder(
                IClaimedFromOrder(
                    auctionId,
                    userId,
                    buyAmount,
                    sellAmount,
                    referralCode,
                    referralFee,
                    sumAuctioningTokenAmount,
                    sumBiddingTokenAmount
                )
            );
        }
    }

    function processFeesAndAuctioneerFunds(
        uint256 auctionId,
        uint256 fillVolumeOfAuctioneerOrder,
        uint64 auctioneerId,
        uint96 fullAuctionedAmount
    ) internal {
        if (auctionData[auctionId].minFundingThresholdNotReached) {
            sendOutTokens(auctionId, fullAuctionedAmount, 0, auctioneerId); //[4]
        } else {
            //[11]
            (, uint96 priceNumerator, uint96 priceDenominator) = auctionData[
                auctionId
            ].clearingPriceOrder.decodeOrder();
            uint256 unsettledAuctionTokens = fullAuctionedAmount.sub(
                fillVolumeOfAuctioneerOrder
            );
            uint256 biddingTokenAmount = fillVolumeOfAuctioneerOrder
                .mul(priceDenominator)
                .div(priceNumerator);

            uint256 usdValue = convertToUSD(
                address(auctionData[auctionId].biddingToken),
                biddingTokenAmount
            );
            uint256 fee = getFeePercentage(usdValue);

            // calculate fees to swap/send to the token address
            uint256 feeAmount = biddingTokenAmount.mul(fee).div(
                FEE_DENOMINATOR
            );

            uint256 biddingTokenAmountAfterFee = biddingTokenAmount.sub(
                feeAmount
            );

            sendOutTokens(
                auctionId,
                unsettledAuctionTokens,
                biddingTokenAmountAfterFee,
                auctioneerId
            ); //[5]

            // swap allowed tokens to ETH
            uint256 ethAmount = feeAmount;
            address biddingAddress = address(
                auctionData[auctionId].biddingToken
            );
            if (biddingAddress != uniswapV2Router.WETH()) {
                uint256 initialEthBalance = address(this).balance;
                swapTokensForEth(biddingAddress, feeAmount);
                ethAmount = address(this).balance.sub(initialEthBalance);
            } else {
                // unwrap WETH to ETH
                IWETH(uniswapV2Router.WETH()).withdraw(ethAmount);
            }

            if (ethAmount > 0) {
                //send eth to the fee receiver
                (bool success, ) = registeredUsers
                    .getAddressAt(feeReceiverUserId)
                    .call{value: ethAmount}("");
                if (!success) revert EthSendingFailed();

                emit Distribution(auctionId, ethAmount);
            }
        }
    }

    function getFeePercentage(uint256 usdValue) public view returns (uint256) {
        // Determine the fee percentage based on the usdValue
        if (usdValue <= fees.tier1Threshold) {
            return fees.feeTier1;
        } else if (usdValue <= fees.tier2Threshold) {
            return fees.feeTier2;
        } else if (usdValue <= fees.tier3Threshold) {
            return fees.feeTier3;
        } else if (usdValue <= fees.tier4Threshold) {
            return fees.feeTier4;
        } else {
            return fees.feeTier5; // Assuming feeTier5 is the highest tier
        }
    }

    function convertToUSD(
        address tokenAddress,
        uint256 tokenAmount
    ) private view returns (uint256) {
        uint256 tokenDecimals = IERC20Metadata(tokenAddress).decimals();
        // check if token is WETH
        if (tokenAddress == address(uniswapV2Router.WETH())) {
            int ethUsdPrice = getLatestEthUsdPrice(); // Get the latest price
            return (tokenAmount * uint256(ethUsdPrice)) / 1e8;
        } else {
            if (tokenDecimals < 18) {
                // Adjust the amount to equivalent value in 18 decimals
                return tokenAmount * 10 ** (18 - uint256(tokenDecimals));
            } else if (tokenDecimals > 18) {
                // If token has more than 18 decimals, downscale it to 18
                return tokenAmount / 10 ** (uint256(tokenDecimals) - 18);
            }
        }
        // If token already has 18 decimals, return the amount as is
        return tokenAmount;
    }

    function getLatestEthUsdPrice() private view returns (int) {
        (, int price, , , ) = priceFeed.latestRoundData();
        return price; // price has 8 decimal places
    }

    function swapTokensForEth(address token, uint256 tokenAmount) private {
        // generate the uniswap pair path of token -> weth
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = uniswapV2Router.WETH();

        IERC20(token).approve(address(uniswapV2Router), tokenAmount);

        // make the swap
        uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // accept any amount of ETH
            path,
            address(this),
            block.timestamp
        );
    }

    function registerReferralEarnings(
        uint256 sellAmount,
        uint256 auctionId,
        bytes32 order
    ) internal returns (string memory referralCode, uint256 referralFee) {
        referralCode = referrals[auctionId][order];
        if (bytes(referralCode).length > 0) {
            referralFee = sellAmount.mul(referralFeeNumerator[auctionId]).div(
                FEE_DENOMINATOR
            );
            uint64 userId = getUserId(address(referralRewardManager));
            sendOutTokens(auctionId, 0, referralFee, userId);
            referralRewardManager.addToBalance(
                referralCode,
                referralFee,
                address(auctionData[auctionId].auctioningToken)
            );
        }
    }

    function sendOutTokens(
        uint256 auctionId,
        uint256 auctioningTokenAmount,
        uint256 biddingTokenAmount,
        uint64 userId
    ) internal {
        address userAddress = registeredUsers.getAddressAt(userId);
        if (auctioningTokenAmount > 0 && auctionToStrategy[auctionId] != 0) {
            auctionData[auctionId].auctioningToken.safeTransfer(
                userAddress,
                auctioningTokenAmount
            );
        }
        if (biddingTokenAmount > 0) {
            auctionData[auctionId].biddingToken.safeTransfer(
                userAddress,
                biddingTokenAmount
            );
        }
    }

    function registerUser(address user) public returns (uint64 userId) {
        numUsers = numUsers.add(1).toUint64();
        require((registeredUsers.insert(numUsers, user)), "E25");
        userId = numUsers;
        emit UserRegistration(user, userId);
    }

    function getUserId(address user) public returns (uint64 userId) {
        if (registeredUsers.hasAddress(user)) {
            userId = registeredUsers.getId(user);
        } else {
            userId = registerUser(user);
            emit NewUser(userId, user);
        }
    }

    function getSecondsRemainingInBatch(
        uint256 auctionId
    ) public view returns (uint256) {
        if (auctionData[auctionId].auctionEndDate < block.timestamp) {
            return 0;
        }
        return auctionData[auctionId].auctionEndDate.sub(block.timestamp);
    }

    function containsOrder(
        uint256 auctionId,
        bytes32 order
    ) public view returns (bool) {
        return sellOrders[auctionId].contains(order);
    }
}
