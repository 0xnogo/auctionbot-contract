import "@nomiclabs/hardhat-ethers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import hre, { deployments, ethers, upgrades, waffle } from "hardhat";

import {
  calculateClearingPrice,
  createTokensAndMintAndApprove,
  encodeOrder,
  getAllSellOrders,
  getClearingPriceFromInitialOrder,
  placeOrders,
  queueStartElement,
  toReceivedFunds,
} from "../../src/priceCalculation";

import {
  createAuctionWithDefaults,
  createAuctionWithDefaultsAndReturnId,
} from "./defaultContractInteractions";
import {
  claimFromAllOrders,
  closeAuction,
  increaseTime,
  sendTxAndGetReturnValue,
  setupTest,
} from "./utilities";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Some tests use different test cases 1,..,10. These test cases are illustrated in the following jam board: /
// https://jamboard.google.com/d/1DMgMYCQQzsSLKPq_hlK3l32JNBbRdIhsOrLB1oHaEYY/edit?usp=sharing               /
//////////////////////////////////////////////////////////////////////////////////////////////////////////////
describe("AuctionBot", async () => {
  const [user_1, user_2, user_3, user_4] = waffle.provider.getWallets();
  let auctionBot: Contract;
  let feeReceiver: string;
  let referralRewardManager: Contract;
  beforeEach(async () => {
    await deployments.fixture("AuctionBot");
    const setup = await setupTest();
    auctionBot = setup.auctionBot;
    feeReceiver = setup.auctionToken.address;
    referralRewardManager = setup.referralRewardManager;
  });

  describe("initiate Auction", async () => {
    it("throws if minimumBiddingAmountPerOrder is zero", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await expect(
        createAuctionWithDefaults(auctionBot, {
          auctioningToken,
          biddingToken,
          minimumBiddingAmountPerOrder: 0,
          minFundingThreshold: 0,
        }),
      ).to.be.revertedWith("E11");
    });

    it("throws if auctioned amount is zero", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await expect(
        createAuctionWithDefaults(auctionBot, {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: 0,
        }),
      ).to.be.revertedWith("E9");
    });
    it("throws if auction is a giveaway", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await expect(
        createAuctionWithDefaults(auctionBot, {
          auctioningToken,
          biddingToken,
          minBuyAmount: 0,
        }),
      ).to.be.revertedWith("E10");
    });
    it("throws if auction periods do not make sense", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await expect(
        createAuctionWithDefaults(auctionBot, {
          auctioningToken,
          biddingToken,
          orderCancellationEndDate: now + 60 * 60 + 1,
          auctionEndDate: now + 60 * 60,
        }),
      ).to.be.revertedWith("E12");
    });
    it("throws if auction end is zero or in the past", async () => {
      // Important: if the auction end is zero, then the check at
      // `atStageSolutionSubmission` would always fail, leading to
      // locked funds in the contract.

      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await expect(
        createAuctionWithDefaults(auctionBot, {
          auctioningToken,
          biddingToken,
          orderCancellationEndDate: 0,
          auctionEndDate: 0,
        }),
      ).to.be.revertedWith("E13");
    });
    it("initiateAuction stores the parameters correctly with strategy id = 1", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const orderCancellationEndDate = now + 42;
      const auctionEndDate = now + 1337;
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          orderCancellationEndDate,
          auctionEndDate,
          strategyId: 1,
        },
      );
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.auctioningToken).to.equal(auctioningToken.address);
      expect(auctionData.biddingToken).to.equal(biddingToken.address);
      expect(auctionData.initialAuctionOrder).to.equal(
        encodeOrder(initialAuctionOrder),
      );
      expect(auctionData.auctionEndDate).to.be.equal(auctionEndDate);
      expect(auctionData.orderCancellationEndDate).to.be.equal(
        orderCancellationEndDate,
      );
      await expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          userId: BigNumber.from(0),
          sellAmount: ethers.utils.parseEther("0"),
          buyAmount: ethers.utils.parseEther("0"),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.be.equal(0);

      expect(await auctioningToken.balanceOf(auctionBot.address)).to.equal(
        ethers.utils.parseEther("1"),
      );
    });

    it("initiateAuction stores the parameters correctly with strategy id = 0", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const orderCancellationEndDate = now + 42;
      const auctionEndDate = now + 1337;
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      await createAuctionWithDefaultsAndReturnId(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
        orderCancellationEndDate,
        auctionEndDate,
        strategyId: 0,
      });

      expect(await auctioningToken.balanceOf(auctionBot.address)).to.equal(
        ethers.utils.parseEther("0"),
      );
    });
  });

  describe("getUserId", async () => {
    it("creates new userIds", async () => {
      expect(
        await sendTxAndGetReturnValue(
          auctionBot,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(2);
      expect(
        await sendTxAndGetReturnValue(
          auctionBot,
          "getUserId(address)",
          user_2.address,
        ),
      ).to.equal(3);
      expect(
        await sendTxAndGetReturnValue(
          auctionBot,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(2);
    });
  });

  describe("placeOrdersOnBehalf", async () => {
    it("places a new order and checks that tokens were transferred", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          orderCancellationEndDate: now + 3600,
          auctionEndDate: now + 3600,
        },
      );

      const balanceBeforeOrderPlacement = await biddingToken.balanceOf(
        user_1.address,
      );
      const balanceBeforeOrderPlacementOfUser2 = await biddingToken.balanceOf(
        user_2.address,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await auctionBot
        .connect(user_1)
        .placeSellOrdersOnBehalf(
          auctionId,
          [buyAmount],
          [sellAmount],
          [queueStartElement],
          user_2.address,
          "",
        );

      expect(await biddingToken.balanceOf(auctionBot.address)).to.equal(
        sellAmount,
      );
      expect(await biddingToken.balanceOf(user_1.address)).to.equal(
        balanceBeforeOrderPlacement.sub(sellAmount),
      );
      expect(await biddingToken.balanceOf(user_2.address)).to.equal(
        balanceBeforeOrderPlacementOfUser2,
      );
      const userId = BigNumber.from(
        await auctionBot.callStatic.getUserId(user_2.address),
      );
      await auctionBot
        .connect(user_2)
        .cancelSellOrders(auctionId, [
          encodeOrder({ sellAmount, buyAmount, userId }),
        ]);
      expect(await biddingToken.balanceOf(auctionBot.address)).to.equal("0");
      expect(await biddingToken.balanceOf(user_2.address)).to.equal(
        balanceBeforeOrderPlacementOfUser2.add(sellAmount),
      );
    });
  });

  describe("placeOrders", async () => {
    it("one can not place orders, if auction is not yet initiated", async () => {
      await expect(
        auctionBot.placeSellOrders(
          0,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1").add(1)],
          [queueStartElement],
          "",
        ),
      ).to.be.revertedWith("E1");
    });
    it("one can not place orders, if auction is over", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await closeAuction(auctionBot, auctionId);
      await expect(
        auctionBot.placeSellOrders(
          0,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1").add(1)],
          [queueStartElement],
          "",
        ),
      ).to.be.revertedWith("E1");
    });
    it("one can not place orders, with a worser or same rate", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await expect(
        auctionBot.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1").add(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "",
        ),
      ).to.be.revertedWith("E16");
      await expect(
        auctionBot.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("E16");
    });
    it("one can not place orders with buyAmount == 0", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await expect(
        auctionBot.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("0")],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "",
        ),
      ).to.be.revertedWith("E15");
    });
    it("does not withdraw funds, if orders are placed twice", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await expect(() =>
        auctionBot.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1").sub(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "",
        ),
      ).to.changeTokenBalances(
        biddingToken,
        [user_1],
        [ethers.utils.parseEther("-1")],
      );
      await expect(() =>
        auctionBot.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1").sub(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "",
        ),
      ).to.changeTokenBalances(biddingToken, [user_1], [BigNumber.from(0)]);
    });
    it("places a new order and checks that tokens were transferred", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
        },
      );

      const balanceBeforeOrderPlacement = await biddingToken.balanceOf(
        user_1.address,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await auctionBot.placeSellOrders(
        auctionId,
        [buyAmount, buyAmount],
        [sellAmount, sellAmount.add(1)],
        [queueStartElement, queueStartElement],
        "",
      );
      const transferredbiddingTokenAmount = sellAmount.add(sellAmount.add(1));

      expect(await biddingToken.balanceOf(auctionBot.address)).to.equal(
        transferredbiddingTokenAmount,
      );
      expect(await biddingToken.balanceOf(user_1.address)).to.equal(
        balanceBeforeOrderPlacement.sub(transferredbiddingTokenAmount),
      );
    });

    it("an order is only placed once", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
        },
      );

      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await auctionBot.placeSellOrders(
        auctionId,
        [buyAmount],
        [sellAmount],
        [queueStartElement],
        "",
      );
      const allPlacedOrders = await getAllSellOrders(auctionBot, auctionId);
      expect(allPlacedOrders.length).to.be.equal(1);
    });
    it("throws, if DDOS attack with small order amounts is started", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(5000),
          buyAmount: ethers.utils.parseEther("1").div(10000),
          userId: BigNumber.from(2),
        },
      ];

      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minimumBiddingAmountPerOrder: ethers.utils.parseEther("1").div(100),
        },
      );
      await expect(
        auctionBot.placeSellOrders(
          auctionId,
          sellOrders.map((buyOrder) => buyOrder.buyAmount),
          sellOrders.map((buyOrder) => buyOrder.sellAmount),
          Array(sellOrders.length).fill(queueStartElement),
          "",
        ),
      ).to.be.revertedWith("E17");
    });
    it("fails, if transfers are failing", async () => {
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
        },
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await biddingToken.approve(
        auctionBot.address,
        ethers.utils.parseEther("0"),
      );

      await expect(
        auctionBot.placeSellOrders(
          auctionId,
          [buyAmount, buyAmount],
          [sellAmount, sellAmount.add(1)],
          [queueStartElement, queueStartElement],
          "",
        ),
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });
  });

  describe("precalculateSellAmountSum", async () => {
    it("fails if too many orders are considered", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(3),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(3),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await expect(
        auctionBot.precalculateSellAmountSum(auctionId, 3),
      ).to.be.revertedWith("E21");
    });
    it("fails if queue end is reached", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(3),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await expect(
        auctionBot.precalculateSellAmountSum(auctionId, 2),
      ).to.be.revertedWith("E20");
    });
    it("verifies that interimSumBidAmount and iterOrder is set correctly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(3),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(3),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);

      await auctionBot.precalculateSellAmountSum(auctionId, 1);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.interimSumBidAmount).to.equal(
        sellOrders[0].sellAmount,
      );

      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
    });
    it("verifies that interimSumBidAmount and iterOrder takes correct starting values by applying twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);

      await auctionBot.precalculateSellAmountSum(auctionId, 1);
      await auctionBot.precalculateSellAmountSum(auctionId, 1);

      const auctionData = await auctionBot.auctionData(auctionId);

      expect(auctionData.interimSumBidAmount).to.equal(
        sellOrders[0].sellAmount.add(sellOrders[0].sellAmount),
      );

      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[1]));
    });
  });

  describe("settleAuction", async () => {
    it("checks case 4, it verifies the price in case of clearing order == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(10),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(2),
        },
      ];

      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await createAuctionWithDefaults(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });

      const auctionId = BigNumber.from(1);
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);

      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      await expect(auctionBot.settleAuction(auctionId))
        .to.emit(auctionBot, "AuctionCleared")
        .withArgs(
          auctionId,
          0,
          price.buyAmount,
          price.sellAmount,
          sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
          sellOrders[0].sellAmount,
          // encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
        );
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(encodeOrder(price));
    });
    it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("5"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await createAuctionWithDefaults(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
        strategyId: 1,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);

      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      await expect(auctionBot.settleAuction(auctionId))
        .to.emit(auctionBot, "AuctionCleared")
        .withArgs(
          auctionId,
          0,
          price.buyAmount,
          price.sellAmount,
          sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
          sellOrders[0].sellAmount,
          // encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
        );
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(encodeOrder(price));
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder with 3 orders", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("2"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(4),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3],
          hre,
        );

      await createAuctionWithDefaults(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      await expect(auctionBot.settleAuction(auctionId))
        .to.emit(auctionBot, "AuctionCleared")
        .withArgs(
          auctionId,
          0,
          price.buyAmount,
          price.sellAmount,
          sellOrders[0].sellAmount
            .mul(3)
            .mul(price.buyAmount)
            .div(price.sellAmount),
          sellOrders[0].sellAmount.mul(3),
        );
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("checks case 6, it verifies the price in case of clearingOrder == initialOrder, although last iterOrder would also be possible", async () => {
      // This test demonstrates the case 6,
      // where price could be either the auctioningOrder or sellOrder
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await createAuctionWithDefaults(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);

      await expect(auctionBot.settleAuction(auctionId))
        .to.emit(auctionBot, "AuctionCleared")
        .withArgs(
          auctionId,
          0,
          initialAuctionOrder.sellAmount,
          initialAuctionOrder.buyAmount,
          initialAuctionOrder.sellAmount,
          sellOrders[0].sellAmount,
        );
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      await auctionBot.claimFromParticipantOrders(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("checks case 12, it verifies that price can not be the initial auction price (Adam's case)", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1").add(1),
        buyAmount: ethers.utils.parseEther("0.1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: BigNumber.from(2),
          buyAmount: BigNumber.from(4),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await createAuctionWithDefaults(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);

      await auctionBot.settleAuction(auctionId);
      await auctionBot.auctionData(auctionId);
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("checks case 3, it verifies the price in case of clearingOrder != placed order with 3x participation", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(4),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(3),
        },
      ];

      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3, user_4],
          hre,
        );

      await createAuctionWithDefaults(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);

      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: ethers.utils.parseEther("3"),
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("checks case 8, it verifies the price in case of no participation of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: BigNumber.from(1000),
        buyAmount: BigNumber.from(1000),
        userId: BigNumber.from(2),
      };

      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      await createAuctionWithDefaults(auctionBot, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);

      await closeAuction(auctionBot, auctionId);

      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(BigNumber.from(0));
    });
    it("checks case 2, it verifies the price in case without a partially filled order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: sellOrders[0].sellAmount,
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("checks case 10, verifies the price in case one sellOrder is eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(20),
          buyAmount: ethers.utils.parseEther("1").mul(10),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        initialAuctionOrder.sellAmount
          .mul(sellOrders[0].sellAmount)
          .div(sellOrders[0].buyAmount),
      );
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("checks case 5, bidding amount matches min buyAmount of initialOrder perfectly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(4),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3, user_4],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
    });
    it("checks case 7, bidding amount matches min buyAmount of initialOrder perfectly with additional order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(4),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.6"),
          userId: BigNumber.from(4),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3, user_4],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 10: it shows an example why userId should always be given: 2 orders with the same price", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(4),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.4"),
          userId: BigNumber.from(4),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3, user_4],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        auctionBot.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 1, it verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      // this is the additional step
      await auctionBot.precalculateSellAmountSum(auctionId, 1);

      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
    });
    it("verifies the price in case of 2 of 4 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step and one more step within settleAuction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      // this is the additional step
      await auctionBot.precalculateSellAmountSum(auctionId, 1);

      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.interimSumBidAmount).to.equal(
        sellOrders[0].sellAmount,
      );
      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
      await auctionBot.settleAuction(auctionId);
      const auctionData2 = await auctionBot.auctionData(auctionId);
      expect(auctionData2.clearingPriceOrder).to.eql(
        encodeOrder(sellOrders[2]),
      );
      expect(auctionData2.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("verifies the price in case of clearing order is decided by userId", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(3),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.be.equal(
        encodeOrder(sellOrders[1]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("simple version of e2e gas test", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(8),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(12),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(16),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );

      await auctionBot.settleAuction(auctionId);
      expect(price.toString()).to.eql(
        getClearingPriceFromInitialOrder(initialAuctionOrder).toString(),
      );
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      await claimFromAllOrders(auctionBot, auctionId, sellOrders);
    });
    it("checks whether the minimalFundingThreshold is not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minFundingThreshold: ethers.utils.parseEther("5"),
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );

      await auctionBot.settleAuction(auctionId);
      expect(price.toString()).to.eql(
        getClearingPriceFromInitialOrder(initialAuctionOrder).toString(),
      );
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.minFundingThresholdNotReached).to.equal(true);
    });
  });

  describe("claimFromAuctioneerOrder", async () => {
    it("checks that auctioneer receives all their auctioningTokens back if minFundingThreshold was not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(4),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3, user_4],
          hre,
        );
      const auctioningTokenBalanceBeforeAuction =
        await auctioningToken.balanceOf(user_1.address);
      const feeReceiver = user_3;
      const feeNumerator = 10;
      await auctionBot.connect(user_1).setFeeParameters(
        {
          feeTier1: 10,
          feeTier2: 20,
          feeTier3: 30,
          feeTier4: 40,
          feeTier5: feeNumerator,
          tier1Threshold: hre.ethers.utils.parseEther("199999"),
          tier2Threshold: hre.ethers.utils.parseEther("399999"),
          tier3Threshold: hre.ethers.utils.parseEther("599999"),
          tier4Threshold: hre.ethers.utils.parseEther("799999"),
          tier5Threshold: hre.ethers.utils.parseEther("800000"),
        },
        feeReceiver.address,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minFundingThreshold: ethers.utils.parseEther("5"),
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);
      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const auctionData = await auctionBot.auctionData(auctionId);
      expect(auctionData.minFundingThresholdNotReached).to.equal(true);
      expect(await auctioningToken.balanceOf(user_1.address)).to.be.equal(
        auctioningTokenBalanceBeforeAuction,
      );
    });
    it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      const feeReceiverBalanceBefore = await hre.ethers.provider.getBalance(
        feeReceiver,
      );
      const callPromise = auctionBot.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(() => callPromise).to.changeTokenBalances(
        auctioningToken,
        [user_1],
        [0],
      );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          auctionBot.address,
          user_1.address,
          price.sellAmount.sub(price.sellAmount.mul(10).div(1000)),
        );

      const feeReceiverBalanceAfter = await hre.ethers.provider.getBalance(
        feeReceiver,
      );

      expect(feeReceiverBalanceAfter.sub(feeReceiverBalanceBefore)).to.equal(
        price.sellAmount.mul(10).div(1000),
      );
    });

    it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder for a erc20 bidding token", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseUnits("1", 6),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseUnits("1", 6).add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "usdc",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );

      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      const feeReceiverBalanceBefore = await hre.ethers.provider.getBalance(
        feeReceiver,
      );
      const callPromise = auctionBot.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(() => callPromise).to.changeTokenBalances(
        auctioningToken,
        [user_1],
        [0],
      );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          auctionBot.address,
          user_1.address,
          price.sellAmount.sub(price.sellAmount.mul(10).div(1000)),
        );

      const feeReceiverBalanceAfter = await hre.ethers.provider.getBalance(
        feeReceiver,
      );

      expect(feeReceiverBalanceAfter.sub(feeReceiverBalanceBefore)).to.gt(0);
    });

    it("checks the claimed amounts for a partially matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const callPromise = auctionBot.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(callPromise)
        .to.emit(auctioningToken, "Transfer")
        .withArgs(
          auctionBot.address,
          user_1.address,
          initialAuctionOrder.sellAmount.sub(sellOrders[0].sellAmount),
        );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          auctionBot.address,
          user_1.address,
          sellOrders[0].sellAmount.sub(
            sellOrders[0].sellAmount.mul(1).div(100),
          ),
        );
    });
  });

  describe("claimFromParticipantOrder", async () => {
    it("checks that participant receives all their biddingTokens back if minFundingThreshold was not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(3),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minFundingThreshold: ethers.utils.parseEther("5"),
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      await expect(() =>
        auctionBot.claimFromParticipantOrders(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.changeTokenBalances(
        biddingToken,
        [user_2],
        [sellOrders[0].sellAmount.add(sellOrders[1].sellAmount)],
      );
    });
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await expect(
        auctionBot.claimFromParticipantOrders(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("E4");
      await closeAuction(auctionBot, auctionId);
      await expect(
        auctionBot.claimFromParticipantOrders(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("E4");
    });
    it("checks the claimed amounts for a partially matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      await auctionBot.settleAuction(auctionId);

      const receivedAmounts = toReceivedFunds(
        await auctionBot.callStatic.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      );
      const settledBuyAmount = sellOrders[1].sellAmount
        .mul(price.buyAmount)
        .div(price.sellAmount)
        .sub(
          sellOrders[0].sellAmount
            .add(sellOrders[1].sellAmount)
            .mul(price.buyAmount)
            .div(price.sellAmount)
            .sub(initialAuctionOrder.sellAmount),
        )
        .sub(1);
      expect(receivedAmounts.auctioningTokenAmount).to.equal(settledBuyAmount);
      expect(receivedAmounts.biddingTokenAmount).to.equal(
        sellOrders[1].sellAmount
          .sub(settledBuyAmount.mul(price.sellAmount).div(price.buyAmount))
          .sub(1),
      );
    });
    it("checks the claimed amounts for a fully not-matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(3),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);
      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      const receivedAmounts = toReceivedFunds(
        await auctionBot.callStatic.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal(
        sellOrders[2].sellAmount,
      );
      expect(receivedAmounts.auctioningTokenAmount).to.equal("0");
    });
    it("checks the claimed amounts for a fully matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      await auctionBot.settleAuction(auctionId);

      const receivedAmounts = toReceivedFunds(
        await auctionBot.callStatic.claimFromParticipantOrders(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal("0");
      expect(receivedAmounts.auctioningTokenAmount).to.equal(
        sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
      );
    });
    it("checks that an order can not be used for claiming twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);
      await auctionBot.claimFromParticipantOrders(auctionId, [
        encodeOrder(sellOrders[0]),
      ]),
        await expect(
          auctionBot.claimFromParticipantOrders(auctionId, [
            encodeOrder(sellOrders[0]),
          ]),
        ).to.be.revertedWith("E24");
    });
  });

  it("checks that orders from different users can not be claimed at once", async () => {
    const initialAuctionOrder = {
      sellAmount: ethers.utils.parseEther("1"),
      buyAmount: ethers.utils.parseEther("1"),
      userId: BigNumber.from(2),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(2),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(3),
      },
    ];
    const { auctioningToken, biddingToken } =
      await createTokensAndMintAndApprove(
        auctionBot,
        "eth",
        [user_1, user_2, user_3],
        hre,
      );

    const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
      auctionBot,
      {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      },
    );
    await placeOrders(auctionBot, sellOrders, auctionId, hre);

    await closeAuction(auctionBot, auctionId);
    await auctionBot.settleAuction(auctionId);
    await expect(
      auctionBot.claimFromParticipantOrders(auctionId, [
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    ).to.be.revertedWith("E23");
  });

  it("checks the claimed amounts are summed up correctly for two orders", async () => {
    const initialAuctionOrder = {
      sellAmount: ethers.utils.parseEther("1"),
      buyAmount: ethers.utils.parseEther("1"),
      userId: BigNumber.from(2),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(2),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(2),
      },
    ];
    const { auctioningToken, biddingToken } =
      await createTokensAndMintAndApprove(
        auctionBot,
        "eth",
        [user_1, user_2],
        hre,
      );

    const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
      auctionBot,
      {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      },
    );
    await placeOrders(auctionBot, sellOrders, auctionId, hre);

    await closeAuction(auctionBot, auctionId);
    const { clearingOrder: price } = await calculateClearingPrice(
      auctionBot,
      auctionId,
    );
    await auctionBot.settleAuction(auctionId);

    const receivedAmounts = toReceivedFunds(
      await auctionBot.callStatic.claimFromParticipantOrders(auctionId, [
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    );
    expect(receivedAmounts.biddingTokenAmount).to.equal(
      sellOrders[0].sellAmount
        .add(sellOrders[1].sellAmount)
        .sub(
          initialAuctionOrder.sellAmount
            .mul(price.sellAmount)
            .div(price.buyAmount),
        ),
    );
    expect(receivedAmounts.auctioningTokenAmount).to.equal(
      initialAuctionOrder.sellAmount.sub(1),
    );
  });

  describe("registerUser", async () => {
    it("registers a user only once", async () => {
      await auctionBot.registerUser(user_1.address);
      await expect(auctionBot.registerUser(user_1.address)).to.be.revertedWith(
        "E25",
      );
    });
  });

  describe("cancelOrder", async () => {
    it("cancels an order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await expect(
        auctionBot.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      )
        .to.emit(biddingToken, "Transfer")
        .withArgs(auctionBot.address, user_1.address, sellOrders[0].sellAmount);
    });
    it("does not allow to cancel a order, if it is too late", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          orderCancellationEndDate: now + 60 * 60,
          auctionEndDate: now + 60 * 60 * 60,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await increaseTime(3601);
      await expect(
        auctionBot.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith("E2");
      await closeAuction(auctionBot, auctionId);
      await expect(
        auctionBot.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith("E2");
    });
    it("can't cancel orders twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      // removes the order
      auctionBot.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]);
      // claims 0 sellAmount tokens
      await expect(
        auctionBot.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      )
        .to.emit(biddingToken, "Transfer")
        .withArgs(auctionBot.address, user_1.address, 0);
    });
    it("prevents an order from canceling, if tx is not from owner", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(3),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await expect(
        auctionBot.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith("E22");
    });
  });

  describe("containsOrder", async () => {
    it("returns true, if it contains order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      expect(
        await auctionBot.callStatic.containsOrder(
          auctionId,
          encodeOrder(sellOrders[0]),
        ),
      ).to.be.equal(true);
    });
  });

  describe("getSecondsRemainingInBatch", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await closeAuction(auctionBot, auctionId);
      expect(
        await auctionBot.callStatic.getSecondsRemainingInBatch(auctionId),
      ).to.be.equal("0");
    });
  });

  describe("claimsFee", async () => {
    it("claims fees fully for a non-partially filled initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const feeReceiver = user_3;
      const feeNumerator = 10;
      await auctionBot.connect(user_1).setFeeParameters(
        {
          feeTier1: 10,
          feeTier2: 20,
          feeTier3: 30,
          feeTier4: 40,
          feeTier5: feeNumerator, // 5% fee (50/1000)]
          tier1Threshold: hre.ethers.utils.parseEther("199999"),
          tier2Threshold: hre.ethers.utils.parseEther("399999"),
          tier3Threshold: hre.ethers.utils.parseEther("599999"),
          tier4Threshold: hre.ethers.utils.parseEther("799999"),
          tier5Threshold: hre.ethers.utils.parseEther("800000"),
        },
        feeReceiver.address,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(auctionBot, auctionId);

      await closeAuction(auctionBot, auctionId);
      await expect(() =>
        auctionBot.settleAuction(auctionId),
      ).to.changeEtherBalance(
        feeReceiver,
        initialAuctionOrder.sellAmount.mul(feeNumerator).div("1000"),
      );

      // contract still holds sufficient funds to pay the participants fully
      await auctionBot.claimFromParticipantOrders(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("claims also fee amount of zero, even when it is changed later", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const feeReceiver = user_3;
      const feeNumerator = 0;
      await auctionBot.connect(user_1).setFeeParameters(
        {
          feeTier1: 10,
          feeTier2: 20,
          feeTier3: 30,
          feeTier4: 40,
          feeTier5: feeNumerator, // 5% fee (50/1000)]
          tier1Threshold: hre.ethers.utils.parseEther("199999"),
          tier2Threshold: hre.ethers.utils.parseEther("399999"),
          tier3Threshold: hre.ethers.utils.parseEther("599999"),
          tier4Threshold: hre.ethers.utils.parseEther("799999"),
          tier5Threshold: hre.ethers.utils.parseEther("800000"),
        },
        feeReceiver.address,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(auctionBot, auctionId);
      await auctionBot.connect(user_1).setFeeParameters(
        {
          feeTier1: 10,
          feeTier2: 20,
          feeTier3: 30,
          feeTier4: 40,
          feeTier5: 50, // 5% fee (50/1000)]
          tier1Threshold: hre.ethers.utils.parseEther("199999"),
          tier2Threshold: hre.ethers.utils.parseEther("399999"),
          tier3Threshold: hre.ethers.utils.parseEther("599999"),
          tier4Threshold: hre.ethers.utils.parseEther("799999"),
          tier5Threshold: hre.ethers.utils.parseEther("800000"),
        },
        feeReceiver.address,
      );

      await closeAuction(auctionBot, auctionId);
      await expect(() =>
        auctionBot.settleAuction(auctionId),
      ).to.changeTokenBalances(
        auctioningToken,
        [feeReceiver],
        [BigNumber.from(0)],
      );

      // contract still holds sufficient funds to pay the participants fully
      await auctionBot.claimFromParticipantOrders(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("claims fees fully for a partially filled initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(4).sub(1),
          userId: BigNumber.from(4),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2, user_3],
          hre,
        );

      const feeReceiver = user_3;
      const feeNumerator = 10;
      await auctionBot.connect(user_1).setFeeParameters(
        {
          feeTier1: 10,
          feeTier2: 20,
          feeTier3: 30,
          feeTier4: 40,
          feeTier5: 50, // 5% fee (50/1000)]
          tier1Threshold: hre.ethers.utils.parseEther("199999"),
          tier2Threshold: hre.ethers.utils.parseEther("399999"),
          tier3Threshold: hre.ethers.utils.parseEther("599999"),
          tier4Threshold: hre.ethers.utils.parseEther("799999"),
          tier5Threshold: hre.ethers.utils.parseEther("800000"),
        },
        feeReceiver.address,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(auctionBot, auctionId);

      await closeAuction(auctionBot, auctionId);
      const ethBalanceBefore = await ethers.provider.getBalance(
        feeReceiver.address,
      );
      await expect(() =>
        auctionBot.settleAuction(auctionId),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_1],
        [
          // since only 1/4th of the tokens were sold, the auctioneer
          // is getting 3/4th of the tokens
          initialAuctionOrder.sellAmount.mul(3).div(4),
        ],
      );

      const ethBalanceAfter = await ethers.provider.getBalance(
        feeReceiver.address,
      );

      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.equal(
        initialAuctionOrder.sellAmount
          .mul(1)
          .div(4)
          .mul(feeNumerator)
          .div(1000),
      );

      // contract still holds sufficient funds to pay the participants fully
      await auctionBot.claimFromParticipantOrders(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
  });

  describe("referral fee", async () => {
    it("checks that the referral fee is paid out correctly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
          referralFeeNumerator: 100,
        },
      );

      // register referral code
      await referralRewardManager.connect(user_3).registerCode("nogo");

      await placeOrders(auctionBot, sellOrders, auctionId, hre, "nogo");

      await closeAuction(auctionBot, auctionId);
      await auctionBot.settleAuction(auctionId);

      await auctionBot.claimFromParticipantOrders(auctionId, [
        encodeOrder(sellOrders[0]),
      ]);

      const referrerBalance = await referralRewardManager.balances(
        user_3.address,
        auctioningToken.address,
      );

      const referralFeeAmount = initialAuctionOrder.sellAmount
        .div(2)
        .mul(100)
        .div(1000);

      expect(referrerBalance).to.eq(referralFeeAmount);
      expect(
        await auctioningToken.balanceOf(referralRewardManager.address),
      ).to.equal(referralFeeAmount);
    });
  });

  describe("fees", async () => {
    it("can only be called by owner", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 10;
      await expect(
        auctionBot.connect(user_2).setFeeParameters(
          {
            feeTier1: 10,
            feeTier2: 20,
            feeTier3: 30,
            feeTier4: 40,
            feeTier5: feeNumerator, // 5% fee (50/1000)]
            tier1Threshold: hre.ethers.utils.parseEther("199999"),
            tier2Threshold: hre.ethers.utils.parseEther("399999"),
            tier3Threshold: hre.ethers.utils.parseEther("599999"),
            tier4Threshold: hre.ethers.utils.parseEther("799999"),
            tier5Threshold: hre.ethers.utils.parseEther("800000"),
          },
          feeReceiver.address,
        ),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("selecting the correct fee tier with oracle call for weth", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("200"),
        buyAmount: ethers.utils.parseEther("200"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("200").add(1),
          buyAmount: ethers.utils.parseEther("200"),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );
      await placeOrders(auctionBot, sellOrders, auctionId, hre);

      await closeAuction(auctionBot, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        auctionBot,
        auctionId,
      );
      const feeReceiverBalanceBefore = await hre.ethers.provider.getBalance(
        feeReceiver,
      );
      const callPromise = auctionBot.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(() => callPromise).to.changeTokenBalances(
        auctioningToken,
        [user_1],
        [0],
      );

      const tier2 = 20;

      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          auctionBot.address,
          user_1.address,
          price.sellAmount.sub(price.sellAmount.mul(tier2).div(1000)),
        );

      const feeReceiverBalanceAfter = await hre.ethers.provider.getBalance(
        feeReceiver,
      );

      expect(feeReceiverBalanceAfter.sub(feeReceiverBalanceBefore)).to.equal(
        price.sellAmount.mul(tier2).div(1000),
      );
    });
  });

  describe("upgradability", async () => {
    it("checks that the contract is upgradable", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(2),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "eth",
          [user_1, user_2],
          hre,
        );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          strategyId: 1,
        },
      );

      await placeOrders(auctionBot, sellOrders, auctionId, hre);
      const NewAuctionBot = await ethers.getContractFactory("AuctionBotV2");
      const upgraded = await upgrades.upgradeProxy(
        auctionBot.address,
        NewAuctionBot,
        {
          call: {
            fn: "initializeV2",
            args: [7],
          },
        },
      );
      await closeAuction(upgraded, auctionId);
      await upgraded.settleAuction(auctionId);

      expect(await upgraded.v2Uint()).to.be.equal(7);
    });
  });
});
