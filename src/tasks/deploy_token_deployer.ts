import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

const createTokenFactory: () => void = () => {
  task("createTokenFactory", "Deploys token factory").setAction(
    async (taskArgs, hardhatRuntime) => {
      const TokenFactory = await hardhatRuntime.ethers.getContractFactory(
        "ERC20Deployer",
      );
      const tokenFactory = await TokenFactory.deploy();

      console.log(tokenFactory.address);
    },
  );
};
export { createTokenFactory };
