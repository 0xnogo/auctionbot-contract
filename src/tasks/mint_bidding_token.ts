import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

const mintBiddingToken: () => void = () => {
  task("mint-bidding-token", "Mints bidding token on testnet").setAction(
    async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const usdcDeployment = await hardhatRuntime.deployments.get("USDC");

      console.log("USDC deployed at:", usdcDeployment.address);

      const token = new Contract(
        usdcDeployment.address,
        usdcDeployment.abi,
      ).connect(caller);

      await token.mint(
        caller.address,
        hardhatRuntime.ethers.utils.parseEther("1000000000"),
      );

      console.log("Minted 1B USDC to:", caller.address);
    },
  );
};
export { mintBiddingToken };
