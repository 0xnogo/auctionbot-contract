import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contractNames } from "../ts/deploy";

const deployMockBiddingToken: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  //only on arbitrum goerli
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  console.log(chainId);
  if (chainId === 421613) {
    const { deployments, getNamedAccounts } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;
    const { mockBiddingToken } = contractNames;

    const deployment = await deploy(mockBiddingToken, {
      from: deployer,
      gasLimit: 8000000,
      args: ["USD Coin", "USDC"],
      log: true,
    });

    await deployments.save("USDC", {
      abi: deployment.abi,
      address: deployment.address,
    });
  }
};

export default deployMockBiddingToken;
deployMockBiddingToken.tags = ["USDC"];
