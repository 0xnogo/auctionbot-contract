import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

const sendEthAuctionToken: () => void = () => {
  task("sendEthAuctionToken", "send Eth to $AUCTION token")
    .addParam("in", "Send in or out of the contract")
    .addOptionalParam("amount", "Amount of $AUCTION token to transfer", "1")
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const auctionDeployment = await hardhatRuntime.deployments.get(
        "AuctionToken",
      );

      console.log(
        "Current eth balance: ",
        (
          await hardhatRuntime.ethers.provider.getBalance(
            auctionDeployment.address,
          )
        ).toString(),
      );

      if (taskArgs.in === "true") {
        await caller.sendTransaction({
          to: auctionDeployment.address,
          value: hardhatRuntime.ethers.utils.parseEther(taskArgs.amount),
        });
      } else {
        const auctionToken = await hardhatRuntime.ethers.getContractAt(
          "AuctionToken",
          auctionDeployment.address,
        );

        await auctionToken.connect(caller).withdrawStuckEth(caller.address);
      }

      console.log(
        "Current eth balance: ",
        (
          await hardhatRuntime.ethers.provider.getBalance(
            auctionDeployment.address,
          )
        ).toString(),
      );
    });
};
export { sendEthAuctionToken };
