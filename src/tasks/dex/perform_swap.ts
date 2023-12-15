import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";
import { getWETH9Address } from "../utils";

const performSwap: () => void = () => {
  task("swapTokensForETH", "Create Swap LP with eth as one of the tokens")
    .addParam("token", "The token address, either usdc or auction")
    .addParam("amountIn", "The min eth amount")
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);
      const DexRouter = await hardhatRuntime.deployments.get("DexRouter");
      const dexRouter = await hardhatRuntime.ethers.getContractAt(
        DexRouter.abi,
        DexRouter.address,
      );

      const usdcDeployment = await hardhatRuntime.deployments.get(`USDC`);
      const usdc = await hardhatRuntime.ethers.getContractAt(
        "MockBiddingToken",
        usdcDeployment.address,
      );

      const auctionDeployment = await hardhatRuntime.deployments.get(
        `AuctionToken`,
      );
      const auction = await hardhatRuntime.ethers.getContractAt(
        "AuctionToken",
        auctionDeployment.address,
      );

      const wethAddress = await getWETH9Address(hardhatRuntime);
      const token = taskArgs.token === "usdc" ? usdc : auction;
      await token
        .connect(caller)
        .approve(dexRouter.address, hardhatRuntime.ethers.constants.MaxUint256);

      const currentBlock = await hardhatRuntime.ethers.provider.getBlock(
        "latest",
      );
      const tx = await dexRouter
        .connect(caller)
        .swapExactTokensForETH(
          taskArgs.amountIn,
          0,
          [token.address, wethAddress],
          caller.address,
          currentBlock.timestamp + 1000,
        );

      await tx.wait();

      console.log(`Swap completed`);
    });
};
export { performSwap };
