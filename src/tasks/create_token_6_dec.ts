import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

const createTestToken6: () => void = () => {
  task("createTestToken6", "Create Token with 6 decimals").setAction(
    async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const ERC20Factory = await hardhatRuntime.ethers.getContractFactory(
        "ERC20Mintable",
      );

      const erc20 = await ERC20Factory.deploy("TestToken", "TT", 6);
      await erc20.deployed();

      await erc20.mint(
        caller.address,
        hardhatRuntime.ethers.utils.parseEther("10000000"),
      );

      console.log("ERC20 deployed to:", erc20.address);
    },
  );
};
export { createTestToken6 };

// npx hardhat createTestToken --network localhost
