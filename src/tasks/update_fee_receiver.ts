import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

const updateFeeReceiver: () => void = () => {
  task("updateFeeReceiver", "Update fee receiver address")
    .addParam("address", "Fee receiver address")
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const auctionBotDeployment = await hardhatRuntime.deployments.get(
        "AuctionBot",
      );

      const auctionBot = await hardhatRuntime.ethers.getContractAt(
        "AuctionBot",
        auctionBotDeployment.address,
      );

      console.log(
        "current fee receiver id: ",
        await auctionBot.feeReceiverUserId(),
      );

      await auctionBot.setFeeParameters(50, taskArgs.address);
    });
};
export { updateFeeReceiver };
