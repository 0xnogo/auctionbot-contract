import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

import { InitiateAuctionInput } from "../../src/ts/types";

import { sendTxAndGetReturnValue } from "./utilities";

type PartialAuctionInput = Partial<InitiateAuctionInput> &
  Pick<InitiateAuctionInput, "auctioningToken" | "biddingToken">;

async function createAuctionInputWithDefaults(
  parameters: PartialAuctionInput,
): Promise<any> {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  return {
    _auctioningToken: parameters.auctioningToken.address,
    _biddingToken: parameters.biddingToken.address,
    _orderCancellationEndDate:
      parameters.orderCancellationEndDate ?? now + 3600,
    _auctionEndDate: parameters.auctionEndDate ?? now + 3600,
    _auctionedSellAmount:
      parameters.auctionedSellAmount ?? ethers.utils.parseEther("1"),
    _minBuyAmount: parameters.minBuyAmount ?? ethers.utils.parseEther("1"),
    _minimumBiddingAmountPerOrder: parameters.minimumBiddingAmountPerOrder ?? 1,
    _minFundingThreshold: parameters.minFundingThreshold ?? 0,
    _referralFeeNumerator: parameters.referralFeeNumerator ?? 0,
    _strategyId: parameters.strategyId ?? "0",
    _strategyInitParams: parameters.strategyInitParams ?? [],
  };
}

export async function createAuctionWithDefaults(
  easyAuction: Contract,
  parameters: PartialAuctionInput,
): Promise<unknown> {
  return easyAuction.initiateAuction(
    await createAuctionInputWithDefaults(parameters),
  );
}

export async function createAuctionWithDefaultsAndReturnId(
  easyAuction: Contract,
  parameters: PartialAuctionInput,
): Promise<BigNumber> {
  return sendTxAndGetReturnValue(
    easyAuction,
    "initiateAuction((address,address,uint256,uint256,uint96,uint96,uint256,uint256,uint256,uint256,bytes32[]))",
    await createAuctionInputWithDefaults(parameters),
  );
}
