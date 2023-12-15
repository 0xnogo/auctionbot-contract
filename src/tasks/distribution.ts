import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

const executeDistribution: () => void = () => {
  task("executeDistribution", "Update fee receiver address").setAction(
    async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const auctionDeployment = await hardhatRuntime.deployments.get(
        "AuctionToken",
      );

      const token = new Contract(
        auctionDeployment.address,
        auctionDeployment.abi,
      ).connect(caller);

      await token.executeDistribution();
    },
  );
};
export { executeDistribution };
