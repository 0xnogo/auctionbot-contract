pragma solidity ^0.8.2;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAuctionBot {
    //E1 - no longer in order placement phase
    //E2 - no longer in order placement and cancelation phase
    //E3 - Auction not in solution submission phase
    //E4 - Auction not yet finished
    //E5 - ReferralRewardManager cannot be zero address
    //E6 - Fee is not allowed to be set higher than 2%
    //E7 - Strategy is currently disabled
    //E8 - referral fee cannot exceed 10%
    //E9 - cannot auction zero tokens
    //E10 - tokens cannot be auctioned for free
    //E11 - minimumBiddingAmountPerOrder is not allowed to be zero
    //E12 - time periods are not configured correctly
    //E13 - auction end date must be in the future
    //E14 - Only owner can create auctions with no strategy
    //E15 - _minBuyAmounts must be greater than 0
    //E16 - limit price not better than mimimal offer
    //E17 - order too small
    //E18 - referral code not registered
    //E19 - referral code owner cannot be submitter
    //E20 - reached end of order list
    //E21 - too many orders summed up
    //E22 - Only the user can cancel his orders
    //E23 - only allowed to claim for same user
    //E24 - order is no longer claimable
    //E25 - User already registered
    //E26 - Bidding token not registered

    //structs
    struct IClaimedFromOrder {
        uint256 auctionId;
        uint64 userId;
        uint96 buyAmount;
        uint96 sellAmount;
        string referralCode;
        uint256 referralFee;
        uint256 auctioningTokenAmount;
        uint256 biddingTokenAmount;
    }
    struct InitParams {
        IERC20 _auctioningToken;
        IERC20 _biddingToken;
        uint256 _orderCancellationEndDate;
        uint256 _auctionEndDate;
        uint96 _auctionedSellAmount;
        uint96 _minBuyAmount;
        uint256 _minimumBiddingAmountPerOrder;
        uint256 _minFundingThreshold;
        uint256 _referralFeeNumerator;
        uint256 _strategyId;
        bytes32[] _strategyInitParams;
    }
    struct AuctionData {
        IERC20 auctioningToken;
        IERC20 biddingToken;
        uint256 orderCancellationEndDate;
        uint256 auctionEndDate;
        bytes32 initialAuctionOrder;
        uint256 minimumBiddingAmountPerOrder;
        uint256 interimSumBidAmount;
        bytes32 interimOrder;
        bytes32 clearingPriceOrder;
        uint96 volumeClearingPriceOrder;
        bool minFundingThresholdNotReached;
        uint256 minFundingThreshold;
    }

    struct Fees {
        uint256 feeTier1;
        uint256 feeTier2;
        uint256 feeTier3;
        uint256 feeTier4;
        uint256 feeTier5;
        uint256 tier1Threshold;
        uint256 tier2Threshold;
        uint256 tier3Threshold;
        uint256 tier4Threshold;
        uint256 tier5Threshold;
    }

    //events
    event NewSellOrder(
        uint256 indexed auctionId,
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount,
        string referralCode
    );
    event CancellationSellOrder(
        uint256 indexed auctionId,
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount
    );
    event ClaimedFromOrder(IClaimedFromOrder params);
    event NewUser(uint64 indexed userId, address indexed userAddress);
    event NewAuction(
        uint256 indexed auctionId,
        IERC20 indexed _auctioningToken,
        IERC20 indexed _biddingToken,
        uint256 orderCancellationEndDate,
        uint256 auctionEndDate,
        uint64 userId,
        uint96 _auctionedSellAmount,
        uint96 _minBuyAmount,
        uint256 minimumBiddingAmountPerOrder,
        uint256 minFundingThreshold
    );
    event AuctionCleared(
        uint256 indexed auctionId,
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount,
        uint96 soldAuctioningTokens,
        uint96 soldBiddingTokens
    );
    event UserRegistration(address indexed user, uint64 userId);
    event Distribution(uint256 indexed auctionId, uint256 amount);

    //functions
    function placeSellOrdersOnBehalf(
        uint256 auctionId,
        uint96[] calldata _minBuyAmounts,
        uint96[] calldata _sellAmounts,
        bytes32[] calldata _prevSellOrders,
        address orderSubmitter,
        string calldata referralCode
    ) external returns (uint64 userId, uint256 sumOfSellAmounts);
}
