import { Contract } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import weth9Networks from "../../../../node_modules/canonical-weth/networks.json";
import { TypedDataDomain } from "../ts/ethers";

export function domain(
  chainId: number,
  verifyingContract: string,
): TypedDataDomain {
  return {
    name: "AccessManager",
    version: "v1",
    chainId,
    verifyingContract,
  };
}

export async function getEasyAuctionContract({
  ethers,
  deployments,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const authenticatorDeployment = await deployments.get("EasyAuction");

  const authenticator = new Contract(
    authenticatorDeployment.address,
    authenticatorDeployment.abi,
  ).connect(ethers.provider);

  return authenticator;
}
export async function getAllowListOffChainManagedContract({
  ethers,
  deployments,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const authenticatorDeployment = await deployments.get(
    "AllowListOffChainManaged",
  );

  const authenticator = new Contract(
    authenticatorDeployment.address,
    authenticatorDeployment.abi,
  ).connect(ethers.provider);

  return authenticator;
}

export async function getDepositAndPlaceOrderContract({
  ethers,
  deployments,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const depositAndPlaceOrderDeployment = await deployments.get(
    "DepositAndPlaceOrder",
  );

  const authenticator = new Contract(
    depositAndPlaceOrderDeployment.address,
    depositAndPlaceOrderDeployment.abi,
  ).connect(ethers.provider);

  return authenticator;
}

export async function getWETH9Address(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  let weth9Address = "";
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (chainId == 1 || chainId == 31337) {
    weth9Address = weth9Networks.WETH9["1"]["address"];
  } else if (chainId === 421613) {
    return "0xEe01c0CD76354C383B8c7B4e65EA88D00B06f36f";
  } else {
    throw new Error("UniswapV2Router not found");
  }
  return weth9Address;
}

export async function getUniswapV2RouterAddress(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  let uniswapV2RouterAddress = "";
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (chainId == 1 || chainId == 31337) {
    uniswapV2RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  } else if (chainId === 421613) {
    return (await hre.deployments.get("DexRouter")).address;
  } else {
    throw new Error("UniswapV2Router not found");
  }

  return uniswapV2RouterAddress;
}

export async function getOracleAddress(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  let oracleAddress = "";
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (chainId == 1 || chainId == 31337) {
    oracleAddress = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
  } else if (chainId === 421613) {
    return "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e";
  } else {
    throw new Error("Oracle not found");
  }
  return oracleAddress;
}

export const isAvaxNetwork = (chainId: number): boolean =>
  chainId === 43113 || chainId === 43114;
