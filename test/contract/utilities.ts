import { BigNumber, Contract } from "ethers";
import { deployments, ethers } from "hardhat";

import { encodeOrder, Order } from "../../src/priceCalculation";
import { getWETH9Address } from "../../src/tasks/utils";

export const MAGIC_VALUE_FROM_ALLOW_LIST_VERIFIER_INTERFACE = "0x19a05a7e";

export async function closeAuction(
  instance: Contract,
  auctionId: BigNumber,
): Promise<void> {
  const time_remaining = (
    await instance.getSecondsRemainingInBatch(auctionId)
  ).toNumber();
  await increaseTime(time_remaining + 1);
}

export async function claimFromAllOrders(
  easyAuction: Contract,
  auctionId: BigNumber,
  orders: Order[],
): Promise<void> {
  for (const order of orders) {
    await easyAuction.claimFromParticipantOrders(auctionId, [
      encodeOrder(order),
    ]);
  }
}

export async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

export async function sendTxAndGetReturnValue<T>(
  contract: Contract,
  fnName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): Promise<T> {
  const result = await contract.callStatic[fnName](...args);
  await contract.functions[fnName](...args);
  return result;
}

export const setupTest = deployments.createFixture(async (hre, options) => {
  await deployments.fixture("AuctionBot");
  const { tokenOwner } = await hre.getNamedAccounts();

  const AuctionBot = await deployments.get("AuctionBot");
  const ReferralRewardManager = await deployments.get("ReferralRewardManager");
  const StrategyManager = await deployments.get("StrategyManager");
  const DepositAndPlaceOrder = await deployments.get("DepositAndPlaceOrder");
  const AuctionToken = await deployments.get("AuctionToken");
  const teamWallet = await deployments.get("TeamWallet");
  const revShareWallet = await deployments.get("RevShareWallet");
  const WETH = await getWETH9Address(hre);

  const auctionBot = await ethers.getContractAt(
    "AuctionBot",
    AuctionBot.address,
  );

  const referralRewardManager = await ethers.getContractAt(
    "ReferralRewardManager",
    ReferralRewardManager.address,
  );

  const strategyManager = await ethers.getContractAt(
    "StrategyManager",
    StrategyManager.address,
  );

  const depositAndPlaceOrder = await ethers.getContractAt(
    "DepositAndPlaceOrder",
    DepositAndPlaceOrder.address,
  );

  const auctionToken = await ethers.getContractAt(
    "AuctionToken",
    AuctionToken.address,
  );
  const weth = await ethers.getContractAt("WETH9", WETH);

  return {
    auctionBot,
    referralRewardManager,
    strategyManager,
    tokenOwner,
    depositAndPlaceOrder,
    weth,
    auctionToken,
    teamWallet,
    revShareWallet,
  };
});
