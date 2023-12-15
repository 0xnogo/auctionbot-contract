import UniswapV2Factory from "@uniswap/v2-core/build/UniswapV2Factory.json";
import UniswapV2Router from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getWETH9Address } from "../tasks/utils";

const deployAuctionToken: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();

  const wethAddress = await getWETH9Address(hre);
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (chainId === 421613) {
    const DexFactory = await ethers.getContractFactory(
      UniswapV2Factory.abi,
      UniswapV2Factory.bytecode,
    );
    const dexFactory = await DexFactory.deploy(deployer);

    await deployments.save("DexFactory", {
      abi: UniswapV2Factory.abi,
      address: dexFactory.address,
    });

    const DexRouter = await ethers.getContractFactory(
      UniswapV2Router.abi,
      UniswapV2Router.bytecode,
    );
    const dexRouter = await DexRouter.deploy(dexFactory.address, wethAddress);

    await deployments.save("DexRouter", {
      abi: UniswapV2Router.abi,
      address: dexRouter.address,
    });
  }
};

export default deployAuctionToken;
deployAuctionToken.tags = ["DEX"];
