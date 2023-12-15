import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

const transferAuctionToken: () => void = () => {
  task("transferAuctionToken", "Transfer $AUCTION token")
    .addOptionalParam("to", "Address to transfer $AUCTION token to")
    .addOptionalParam("amount", "Amount of $AUCTION token to transfer", "1000")
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const auctionDeployment = await hardhatRuntime.deployments.get(
        "AuctionToken",
      );

      const token = new Contract(
        auctionDeployment.address,
        auctionDeployment.abi,
      ).connect(caller);

      console.log("$AUCTION balance:", await token.balanceOf(caller.address));

      if (!taskArgs.to) {
        taskArgs.to = hardhatRuntime.ethers.Wallet.createRandom().address;
      }

      await token.transfer(
        taskArgs.to,
        hardhatRuntime.ethers.utils.parseEther(taskArgs.amount),
      );
    });
};
export { transferAuctionToken };
