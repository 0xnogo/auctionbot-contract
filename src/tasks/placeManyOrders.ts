import "@nomiclabs/hardhat-ethers";
import { BigNumber, ethers } from "ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

import { queueStartElement } from "../priceCalculation";

import { getEasyAuctionContract } from "./utils";

/// This hardhat tasks was only quickly build for testing purposes and
/// it will not work in a generalized case. Please use only, if you understand
/// the code

const placeManyOrders: () => void = () => {
  task("placeManyOrders", "Allows to place many orders for testing purposes")
    .addParam("auctionId", "ID of the auction")
    .addParam("nrOfOrders", "number of orders to place")
    .addParam("sellAmount", "The amount of bidding tokens to provide")
    .addParam(
      "minBuyAmount",
      "The amount of auctioning tokens to receive at least",
    )
    .addOptionalParam(
      "referralCode",
      "The amount of auctioning tokens to receive at least",
      "",
    )
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const easyAuction = await getEasyAuctionContract(hardhatRuntime);

      console.log(easyAuction);
      const auctionData = await easyAuction.auctionData(taskArgs.auctionId);
      const biddingToken = await hardhatRuntime.ethers.getContractAt(
        "ERC20",
        auctionData.biddingToken,
      );
      const auctioningToken = await hardhatRuntime.ethers.getContractAt(
        "ERC20",
        auctionData.auctioningToken,
      );
      const sellAmountsInAtoms = ethers.utils.parseUnits(
        taskArgs.sellAmount,
        await auctioningToken.callStatic.decimals(),
      );
      const minBuyAmountInAtoms = ethers.utils.parseUnits(
        taskArgs.minBuyAmount,
        await biddingToken.callStatic.decimals(),
      );

      console.log("Using EasyAuction deployed to:", easyAuction.address);

      const balance = await biddingToken.callStatic.balanceOf(caller.address);
      const totalSellingAmountInAtoms = sellAmountsInAtoms.mul(
        taskArgs.nrOfOrders,
      );

      if (totalSellingAmountInAtoms.gt(balance)) {
        throw new Error("Balance not sufficient");
      }

      const allowance = await biddingToken.callStatic.allowance(
        caller.address,
        easyAuction.address,
      );
      console.log("Approving tokens:");
      const tx = await auctioningToken
        .connect(caller)
        .approve(easyAuction.address, ethers.constants.MaxUint256);
      await tx.wait();
      console.log("Approved");
      const orderBlockSize = 50;
      if (taskArgs.nrOfOrders % orderBlockSize !== 0) {
        throw new Error("nrOfOrders must be a multiple of orderBlockSize");
      }
      for (let i = 0; i < taskArgs.nrOfOrders / orderBlockSize; i += 1) {
        const minBuyAmounts = [];
        for (let j = 0; j < orderBlockSize; j++) {
          console.log(
            ethers.utils.formatEther(
              minBuyAmountInAtoms.sub(
                BigNumber.from(i * orderBlockSize + j).mul(
                  minBuyAmountInAtoms.div(10).div(taskArgs.nrOfOrders),
                ),
              ),
            ),
          );
          minBuyAmounts.push(
            minBuyAmountInAtoms.sub(
              BigNumber.from(i * orderBlockSize + j).mul(
                minBuyAmountInAtoms.div(10).div(taskArgs.nrOfOrders),
              ),
            ),
          );
        }
        const tx = await easyAuction.connect(caller).placeSellOrders(
          taskArgs.auctionId,
          minBuyAmounts,
          Array(orderBlockSize).fill(sellAmountsInAtoms),
          Array(orderBlockSize).fill(queueStartElement), //<-- very inefficient, please use only one rinkeby
          taskArgs.referralCode,
        );
        const txResult = await tx.wait();
        console.log("Placed order", i, " with result", txResult);
      }
    });
};
export { placeManyOrders };

// npx hardhat placeManyOrders --auction-id 1 --nr-of-orders 100 --sell-amount 200 --min-buy-amount 0.05 --network localhost
