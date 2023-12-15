import { BigNumber, Contract, Wallet } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
export interface Price {
  priceNumerator: BigNumber;
  priceDenominator: BigNumber;
}

export interface ReceivedFunds {
  auctioningTokenAmount: BigNumber;
  biddingTokenAmount: BigNumber;
}

export interface OrderResult {
  auctioningToken: string;
  biddingToken: string;
  auctionEndDate: BigNumber;
  orderCancellationEndDate: BigNumber;
  initialAuctionOrder: string;
  minimumBiddingAmountPerOrder: BigNumber;
  interimSumBidAmount: BigNumber;
  interimOrder: string;
  clearingPriceOrder: string;
  volumeClearingPriceOrder: BigNumber;
  feeNumerator: BigNumber;
}

export interface Order {
  sellAmount: BigNumber;
  buyAmount: BigNumber;
  userId: BigNumber;
}

export const queueStartElement =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
export const queueLastElement =
  "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";

export function getClearingPriceFromInitialOrder(order: Order): Order {
  return {
    userId: BigNumber.from(0),
    sellAmount: order.buyAmount,
    buyAmount: order.sellAmount,
  };
}
export function encodeOrder(order: Order): string {
  return (
    "0x" +
    order.userId.toHexString().slice(2).padStart(16, "0") +
    order.buyAmount.toHexString().slice(2).padStart(24, "0") +
    order.sellAmount.toHexString().slice(2).padStart(24, "0")
  );
}

export function decodeOrder(bytes: string): Order {
  return {
    userId: BigNumber.from("0x" + bytes.substring(2, 18)),
    sellAmount: BigNumber.from("0x" + bytes.substring(43, 66)),
    buyAmount: BigNumber.from("0x" + bytes.substring(19, 42)),
  };
}

export function toReceivedFunds(result: [BigNumber, BigNumber]): ReceivedFunds {
  return {
    auctioningTokenAmount: result[0],
    biddingTokenAmount: result[1],
  };
}

export async function getInitialOrder(
  easyAuction: Contract,
  auctionId: BigNumber,
): Promise<Order> {
  const auctionDataStruct = await easyAuction.auctionData(auctionId);
  return decodeOrder(auctionDataStruct.initialAuctionOrder);
}

export async function getInterimOrder(
  easyAuction: Contract,
  auctionId: BigNumber,
): Promise<Order> {
  const auctionDataStruct = await easyAuction.auctionData(auctionId);
  return decodeOrder(auctionDataStruct.interimOrder);
}

export async function getAuctionEndTimeStamp(
  easyAuction: Contract,
  auctionId: BigNumber,
): Promise<BigNumber> {
  const auctionDataStruct = await easyAuction.auctionData(auctionId);
  return auctionDataStruct.auctionEndDate;
}

export function hasLowerClearingPrice(order1: Order, order2: Order): number {
  if (
    order1.buyAmount
      .mul(order2.sellAmount)
      .lt(order2.buyAmount.mul(order1.sellAmount))
  )
    return -1;
  if (order1.buyAmount.lt(order2.buyAmount)) return -1;
  if (
    order1.buyAmount
      .mul(order2.sellAmount)
      .eq(order2.buyAmount.mul(order1.sellAmount))
  ) {
    if (order1.userId < order2.userId) return -1;
  }
  return 1;
}

export async function calculateClearingPrice(
  easyAuction: Contract,
  auctionId: BigNumber,
  debug = false,
): Promise<{ clearingOrder: Order; numberOfOrdersToClear: number }> {
  const initialOrder = await getInitialOrder(easyAuction, auctionId);
  const sellOrders = await getAllSellOrders(easyAuction, auctionId);
  sellOrders.sort(function (a: Order, b: Order) {
    return hasLowerClearingPrice(a, b);
  });

  const clearingPriceOrder = findClearingPrice(sellOrders, initialOrder);
  const interimOrder = await getInterimOrder(easyAuction, auctionId);
  let numberOfOrdersToClear;
  if (
    interimOrder.userId === BigNumber.from(0) &&
    interimOrder.sellAmount === BigNumber.from(0) &&
    interimOrder.buyAmount === BigNumber.from(0)
  ) {
    numberOfOrdersToClear = sellOrders.filter((order) =>
      hasLowerClearingPrice(order, clearingPriceOrder),
    ).length;
  } else {
    numberOfOrdersToClear = sellOrders.filter(
      (order) =>
        hasLowerClearingPrice(order, clearingPriceOrder) &&
        hasLowerClearingPrice(interimOrder, order),
    ).length;
  }

  return {
    clearingOrder: clearingPriceOrder,
    numberOfOrdersToClear,
  };
}

export function findClearingPrice(
  sellOrders: Order[],
  initialAuctionOrder: Order,
): Order {
  sellOrders.forEach(function (order, index) {
    if (index > 1) {
      if (!hasLowerClearingPrice(sellOrders[index - 1], order)) {
        throw Error("The orders must be sorted");
      }
    }
  });
  let totalSellVolume = BigNumber.from(0);

  for (const order of sellOrders) {
    totalSellVolume = totalSellVolume.add(order.sellAmount);
    if (
      totalSellVolume
        .mul(order.buyAmount)
        .div(order.sellAmount)
        .gte(initialAuctionOrder.sellAmount)
    ) {
      const coveredBuyAmount = initialAuctionOrder.sellAmount.sub(
        totalSellVolume
          .sub(order.sellAmount)
          .mul(order.buyAmount)
          .div(order.sellAmount),
      );
      const sellAmountClearingOrder = coveredBuyAmount
        .mul(order.sellAmount)
        .div(order.buyAmount);
      if (sellAmountClearingOrder.gt(BigNumber.from(0))) {
        return order;
      } else {
        return {
          userId: BigNumber.from(0),
          buyAmount: initialAuctionOrder.sellAmount,
          sellAmount: totalSellVolume.sub(order.sellAmount),
        };
      }
    }
  }
  // otherwise, clearing price is initialAuctionOrder
  if (totalSellVolume.gt(initialAuctionOrder.buyAmount)) {
    return {
      userId: BigNumber.from(0),
      buyAmount: initialAuctionOrder.sellAmount,
      sellAmount: totalSellVolume,
    };
  } else {
    return {
      userId: BigNumber.from(0),
      buyAmount: initialAuctionOrder.sellAmount,
      sellAmount: initialAuctionOrder.buyAmount,
    };
  }
}

export async function getAllSellOrders(
  easyAuction: Contract,
  auctionId: BigNumber,
): Promise<Order[]> {
  const filterSellOrders = easyAuction.filters.NewSellOrder(
    auctionId,
    null,
    null,
    null,
  );
  const logs = await easyAuction.queryFilter(filterSellOrders, 0, "latest");
  const events = logs.map((log: any) => easyAuction.interface.parseLog(log));
  const sellOrders = events.map((x: any) => {
    const order: Order = {
      userId: x.args[1],
      sellAmount: x.args[3],
      buyAmount: x.args[2],
    };
    return order;
  });

  const filterOrderCancellations = easyAuction.filters.CancellationSellOrder;
  const logsForCancellations = await easyAuction.queryFilter(
    filterOrderCancellations(),
    0,
    "latest",
  );
  const eventsForCancellations = logsForCancellations.map((log: any) =>
    easyAuction.interface.parseLog(log),
  );
  const sellOrdersDeletions = eventsForCancellations.map((x: any) => {
    const order: Order = {
      userId: x.args[1],
      sellAmount: x.args[3],
      buyAmount: x.args[2],
    };
    return order;
  });
  for (const orderDeletion of sellOrdersDeletions) {
    sellOrders.splice(sellOrders.indexOf(orderDeletion), 1);
  }
  return sellOrders;
}

export async function impersonateAndSendTo(
  impersonate: string,
  user: string,
  tokenAddress: string,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  const token = await hre.ethers.getContractAt("ERC20Mintable", tokenAddress);
  const balance = await token.balanceOf(impersonate);
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [impersonate],
  });
  const signer = await hre.ethers.provider.getSigner(impersonate);

  await token.connect(signer).transfer(user, balance.div(1000));
}

export async function createTokensAndMintAndApprove(
  auctionBot: Contract,
  biddingTokenType: "eth" | "usdc" | "usdt" | "dai",
  users: Wallet[],
  hre: HardhatRuntimeEnvironment,
): Promise<{ auctioningToken: Contract; biddingToken: Contract }> {
  const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");
  const auctioningToken = await ERC20.deploy("AT", "AT", 18);

  let biddingToken;
  let impersontedAddress: string;

  if (biddingTokenType === "eth") {
    biddingToken = await hre.ethers.getContractAt(
      "WETH9",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    );
  } else if (biddingTokenType === "usdc") {
    impersontedAddress = "0xa0699129a116c2ee67a7ca7ef56d3cd70d565230";
    biddingToken = await hre.ethers.getContractAt(
      "ERC20Mintable",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    );
  } else if (biddingTokenType === "usdt") {
    impersontedAddress = "0x55c11477577636024f8c4e776cda758c6f81cdaf";
    biddingToken = await hre.ethers.getContractAt(
      "ERC20Mintable",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    );
  } else if (biddingTokenType === "dai") {
    impersontedAddress = "0x60faae176336dab62e284fe19b885b095d29fb7f";
    biddingToken = await hre.ethers.getContractAt(
      "ERC20Mintable",
      "0x6b175474e89094c44da98b954eedeac495271d0f",
    );
  } else {
    biddingToken = await ERC20.deploy("AT", "AT");
  }

  for (const user of users) {
    await auctioningToken.mint(user.address, BigNumber.from(10).pow(30));
    await auctioningToken
      .connect(user)
      .approve(auctionBot.address, BigNumber.from(10).pow(30));

    if (biddingTokenType === "eth") {
      // wrap eth
      await biddingToken
        .connect(user)
        .deposit({ value: hre.ethers.utils.parseEther("10000") });
    } else if (
      biddingTokenType === "usdc" ||
      biddingTokenType === "usdt" ||
      biddingTokenType === "dai"
    ) {
      await impersonateAndSendTo(
        impersontedAddress,
        user.address,
        biddingToken.address,
        hre,
      );
    } else {
      await biddingToken.mint(user.address, BigNumber.from(10).pow(30));
    }

    await biddingToken
      .connect(user)
      .approve(auctionBot.address, BigNumber.from(10).pow(30));
  }
  return { auctioningToken: auctioningToken, biddingToken: biddingToken };
}

export function toPrice(result: [BigNumber, BigNumber]): Price {
  return {
    priceNumerator: result[0],
    priceDenominator: result[1],
  };
}

export async function placeOrders(
  easyAuction: Contract,
  sellOrders: Order[],
  auctionId: BigNumber,
  hre: HardhatRuntimeEnvironment,
  referralCode?: string,
): Promise<void> {
  for (const sellOrder of sellOrders) {
    await easyAuction
      .connect(
        hre.waffle.provider.getWallets()[sellOrder.userId.toNumber() - 2],
      )
      .placeSellOrders(
        auctionId,
        [sellOrder.buyAmount],
        [sellOrder.sellAmount],
        [queueStartElement],
        referralCode ?? "",
      );
  }
}
