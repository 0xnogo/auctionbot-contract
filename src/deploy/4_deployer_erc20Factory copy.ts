import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contractNames } from "../ts/deploy";

const deployERC20Factory: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy } = deployments;
  const { erc20Factory } = contractNames;

  await deploy(erc20Factory, {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
  });
};

export default deployERC20Factory;
deployERC20Factory.tags = ["EasyContract"];
deployERC20Factory.dependencies = ["AuctionBot"];
