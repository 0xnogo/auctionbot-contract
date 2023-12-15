/// This file does not represent extensive unit tests, but rather just demonstrates an example
import "@nomiclabs/hardhat-ethers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import {
  createTokensAndMintAndApprove,
  encodeOrder,
  queueStartElement,
} from "../../src/priceCalculation";

import { createAuctionWithDefaultsAndReturnId } from "./defaultContractInteractions";
import { setupTest } from "./utilities";

describe("DepositAndPlaceOrder - integration tests", async () => {
  const [user_1, user_2] = waffle.provider.getWallets();
  let auctionBot: Contract;
  let depositAndPlaceOrder: Contract;
  let weth: Contract;
  beforeEach(async () => {
    const setup = await setupTest();
    auctionBot = setup.auctionBot;
    weth = setup.weth;
    depositAndPlaceOrder = setup.depositAndPlaceOrder;
  });
  describe("AccessManager - placing order with the native token", async () => {
    it("integration test: places a new order and checks that tokens were transferred - with whitelisting", async () => {
      const { auctioningToken } = await createTokensAndMintAndApprove(
        auctionBot,
        "eth",
        [user_1, user_2],
        hre,
      );

      const biddingToken = weth;
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          strategyId: 1,
        },
      );

      const biddingAmount = BigNumber.from(10).pow(18);

      await depositAndPlaceOrder
        .connect(user_2)
        .depositAndPlaceOrder(
          auctionId,
          [BigNumber.from(10).pow(15)],
          [queueStartElement],
          "",
          { value: biddingAmount },
        );

      expect(
        await biddingToken.connect(user_2).balanceOf(auctionBot.address),
      ).to.equal(biddingAmount);
      const balanceBeforeOrderPlacementOfUser2 = await biddingToken.balanceOf(
        user_2.address,
      );
      await expect(
        auctionBot.connect(user_2).cancelSellOrders(auctionId, [
          encodeOrder({
            sellAmount: biddingAmount,
            buyAmount: BigNumber.from(10).pow(15),
            userId: BigNumber.from(3),
          }),
        ]),
      )
        .to.emit(biddingToken, "Transfer")
        .withArgs(auctionBot.address, user_2.address, biddingAmount);
      expect(await biddingToken.balanceOf(user_2.address)).to.equal(
        balanceBeforeOrderPlacementOfUser2.add(biddingAmount),
      );
    });

    it("unit test: throws, if sellAmount is too big", async () => {
      const { auctioningToken } = await createTokensAndMintAndApprove(
        auctionBot,
        "eth",
        [user_1, user_2],
        hre,
      );
      const biddingToken = weth;
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken,
          strategyId: 1,
        },
      );

      const biddingAmount = BigNumber.from(2).pow(98);

      await expect(
        depositAndPlaceOrder
          .connect(user_2)
          .depositAndPlaceOrder(
            auctionId,
            [BigNumber.from(10).pow(15)],
            [queueStartElement],
            "",
            { value: biddingAmount },
          ),
      ).to.revertedWith("too much value sent");
    });

    it("unit test: throws, if nativeToken is not supporting deposit", async () => {
      const DepositAndPlaceOrder = await ethers.getContractFactory(
        "DepositAndPlaceOrder",
      );

      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          auctionBot,
          "usdc",
          [user_1, user_2],
          hre,
        );
      depositAndPlaceOrder = await DepositAndPlaceOrder.deploy(
        auctionBot.address,
        biddingToken.address,
      );
      const biddingTokenCorrect = weth;
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        auctionBot,
        {
          auctioningToken,
          biddingToken: biddingTokenCorrect,
          strategyId: 1,
        },
      );

      const biddingAmount = BigNumber.from(10).pow(18);

      await expect(
        depositAndPlaceOrder
          .connect(user_2)
          .depositAndPlaceOrder(
            auctionId,
            [BigNumber.from(10).pow(15)],
            [queueStartElement],
            "",
            { value: biddingAmount },
          ),
      ).to.reverted;
    });
  });

  describe("Leftover logic", async () => {
    it("should return 0 when all the weth is used", async () => {
      const DepositAndPlaceOrderFactory = await ethers.getContractFactory(
        "DepositAndPlaceOrder",
      );
      const MockAuctionBot = await ethers.getContractFactory("MockAuctionBot");
      const auctionBotMock = await MockAuctionBot.deploy(weth.address);
      depositAndPlaceOrder = await DepositAndPlaceOrderFactory.deploy(
        auctionBotMock.address,
        weth.address,
      );

      const valuePlaced = ethers.utils.parseEther("1");
      // set up
      await auctionBotMock.setAmount(valuePlaced);

      // call for depositAndPlaceOrder
      await depositAndPlaceOrder
        .connect(user_2)
        .depositAndPlaceOrder(
          0,
          [BigNumber.from(10).pow(15)],
          [queueStartElement],
          "",
          { value: valuePlaced },
        );

      expect(await weth.balanceOf(depositAndPlaceOrder.address)).to.equal(0);
      expect(await weth.balanceOf(auctionBotMock.address)).to.equal(
        valuePlaced,
      );
    });

    it("should return some eth if not all is placed in auction", async () => {
      const DepositAndPlaceOrderFactory = await ethers.getContractFactory(
        "DepositAndPlaceOrder",
      );
      const MockAuctionBot = await ethers.getContractFactory("MockAuctionBot");
      const creditAuctionMock = await MockAuctionBot.deploy(weth.address);
      depositAndPlaceOrder = await DepositAndPlaceOrderFactory.deploy(
        creditAuctionMock.address,
        weth.address,
      );

      const valueSent = ethers.utils.parseEther("1");
      const valuePlaced = ethers.utils.parseEther("0.4");
      // set up
      await creditAuctionMock.setAmount(valuePlaced);

      const balanceBefore = await ethers.provider.getBalance(user_2.address);

      // call for depositAndPlaceOrder
      await depositAndPlaceOrder
        .connect(user_2)
        .depositAndPlaceOrder(
          0,
          [BigNumber.from(10).pow(15)],
          [queueStartElement],
          "",
          { value: valueSent },
        );

      const balanceAfter = await ethers.provider.getBalance(user_2.address);

      expect(await weth.balanceOf(depositAndPlaceOrder.address)).to.equal(0);
      expect(await weth.balanceOf(creditAuctionMock.address)).to.equal(
        valuePlaced,
      );
      expect(balanceBefore.sub(balanceAfter)).to.be.closeTo(
        valuePlaced,
        ethers.utils.parseEther("0.01"),
      );
    });
  });
});
