import "@nomiclabs/hardhat-ethers";
import { BigNumber, ethers } from "ethers";
import "hardhat-deploy";
import { task, types } from "hardhat/config";

import { getEasyAuctionContract } from "./utils";

const initiateAuction: () => void = () => {
  task("initiateAuction", "Starts a new auction")
    .addParam(
      "auctioningToken",
      "The ERC20's address of the token that should be sold",
    )
    .addParam(
      "biddingToken",
      "The ERC20's address of the token that should be bought",
    )
    .addParam(
      "sellAmount",
      "The amount of auctioningTokens to be sold in atoms",
    )
    .addParam(
      "minBuyAmount",
      "The amount of biddingToken to be bought at least for selling sellAmount in atoms",
    )
    .addOptionalParam(
      "auctionEndDate",
      "The timestamp (in seconds) marking the end of the auction",
      undefined,
      types.string,
    )
    .addOptionalParam(
      "minFundingThreshold",
      "The minimal funding threshold for executing the settlement. If funding is not reached, everyone will get back their investment",
      "0",
      types.string,
    )
    .addOptionalParam(
      "orderCancellationEndDate",
      "The timestamp (in seconds) until which orders can be canceled",
      undefined,
      types.string,
    )
    .addOptionalParam(
      "minBuyAmountPerOrder",
      "Describes the minimal buyAmount per order placed in the auction. This can be used in order to protect against too high gas costs for the settlement",
      "0.01",
      types.string,
    )
    .addOptionalParam(
      "referralFeeNumerator",
      "Referral fee for the tx - set to 0 if you dont want to support referrals for the auction",
      "20",
      types.string,
    )
    .addOptionalParam(
      "strategyId",
      "Strategy id that the contract should use - default 1",
      "1",
      types.string,
    )
    .addVariadicPositionalParam(
      "strategyInitParams",
      "Init params for the specific strategy - default empty array",
      [],
    )
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const easyAuction = await getEasyAuctionContract(hardhatRuntime);
      const biddingToken = await hardhatRuntime.ethers.getContractAt(
        "ERC20",
        taskArgs.biddingToken,
      );
      const auctioningToken = await hardhatRuntime.ethers.getContractAt(
        "ERC20",
        taskArgs.auctioningToken,
      );
      const sellAmountsInAtoms = ethers.utils.parseUnits(
        taskArgs.sellAmount,
        await auctioningToken.callStatic.decimals(),
      );
      const minBuyAmountInAtoms = ethers.utils.parseUnits(
        taskArgs.minBuyAmount,
        await biddingToken.callStatic.decimals(),
      );
      const minParticipantsBuyAmount = ethers.utils.parseUnits(
        taskArgs.minBuyAmountPerOrder,
        await biddingToken.callStatic.decimals(),
      );
      const minFundingThresholdInAtoms = ethers.utils.parseUnits(
        taskArgs.minFundingThreshold,
        await biddingToken.callStatic.decimals(),
      );
      const referralFeeNumerator = BigNumber.from(
        taskArgs.referralFeeNumerator,
      );
      const strategyId = BigNumber.from(taskArgs.strategyId);

      console.log("Using EasyAuction deployed to:", easyAuction.address);

      const balance = await auctioningToken.callStatic.balanceOf(
        caller.address,
      );
      if (sellAmountsInAtoms.gt(balance)) {
        throw new Error("Balance not sufficient");
      }

      const allowance = await auctioningToken.callStatic.allowance(
        caller.address,
        easyAuction.address,
      );
      if (sellAmountsInAtoms.gt(allowance)) {
        console.log("Approving tokens:");
        const tx = await auctioningToken
          .connect(caller)
          .approve(easyAuction.address, sellAmountsInAtoms);
        await tx.wait();
        console.log("Approved");
      }

      console.log("Starting Auction:");
      const now = Math.floor(Date.now() / 1000);
      const tx = await easyAuction.connect(caller).initiateAuction({
        _auctioningToken: auctioningToken.address,
        _biddingToken: biddingToken.address,
        orderCancellationEndDate: taskArgs.orderCancellationEndDate ?? 0,
        auctionEndDate: taskArgs.auctionEndDate ?? now + 360000,
        _auctionedSellAmount: sellAmountsInAtoms,
        _minBuyAmount: minBuyAmountInAtoms,
        minimumBiddingAmountPerOrder: minParticipantsBuyAmount,
        minFundingThreshold: minFundingThresholdInAtoms,
        _referralFeeNumerator: referralFeeNumerator,
        strategyId: strategyId,
        _strategyInitParams: taskArgs.strategyInitParams,
      });
      const txResult = await tx.wait();
      const auctionId = txResult.events
        .filter((event: any) => event.event === "NewAuction")
        .map((event: any) => event.args.auctionId);
      console.log(
        "Your auction has been schedule and has the Id:",
        auctionId.toString(),
      );
    });
};
export { initiateAuction };

//yarn hardhat initiateAuction --auctioning-token "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853" --min-buy-amount-per-order 0.05 --bidding-token "0x0165878A594ca255338adfa4d48449f69242Eb8F" --sell-amount 100000 --min-buy-amount 800 --min-funding-threshold 800 --referral-fee-numerator 20 --strategy-id 1 --network localhost
