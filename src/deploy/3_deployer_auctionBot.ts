import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  getOracleAddress,
  getUniswapV2RouterAddress,
  getWETH9Address,
} from "../tasks/utils";
import { contractNames } from "../ts/deploy";

const deployAuctionBot: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, get } = deployments;
  const {
    depositAndPlaceOrder,
    referralRewardManager,
    auctionBot,
    auctionToken,
    strategyManager,
  } = contractNames;

  const auctionTokenAddress = (await get(auctionToken)).address;
  const wethAddress = await getWETH9Address(hre);
  const aggregatorV3InterfaceAddress = await getOracleAddress(hre);

  const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  let biddingTokens = [usdcAddress, usdtAddress, daiAddress, wethAddress];
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (chainId === 421613) {
    const mockBiddingTokenDeployment = await deployments.get("USDC");
    const mockBiddingTokenAddress = mockBiddingTokenDeployment.address;
    biddingTokens = [mockBiddingTokenAddress];
  }
  const uniswapV2RouterAddress = await getUniswapV2RouterAddress(hre);

  await deploy(referralRewardManager, {
    from: deployer,
    gasLimit: 9500000,
    args: [],
    log: true,
  });

  const referralRewardManagerDeployed = await get(referralRewardManager);

  await deploy(strategyManager, {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
  });

  const strategyManagerDeployed = await get(strategyManager);

  const AuctionBotFactory = await hre.ethers.getContractFactory(auctionBot);
  const auctionBotContract = await hre.upgrades.deployProxy(
    AuctionBotFactory,
    [
      referralRewardManagerDeployed.address,
      strategyManagerDeployed.address,
      auctionTokenAddress, // address to collect fees in
      {
        feeTier1: 10,
        feeTier2: 20,
        feeTier3: 30,
        feeTier4: 40,
        feeTier5: 50, // 5% fee (50/1000)]
        tier1Threshold: hre.ethers.utils.parseEther("199999"),
        tier2Threshold: hre.ethers.utils.parseEther("399999"),
        tier3Threshold: hre.ethers.utils.parseEther("599999"),
        tier4Threshold: hre.ethers.utils.parseEther("799999"),
        tier5Threshold: hre.ethers.utils.parseEther("800000"),
      },
      uniswapV2RouterAddress,
      aggregatorV3InterfaceAddress,
      biddingTokens, // array of addresses to be whitelisted
    ],
    {
      initializer: "initialize",
      kind: "uups",
    },
  );

  auctionBotContract.deployed();

  hre.deployments.save("AuctionBot", {
    abi: auctionBotContract.abi,
    address: auctionBotContract.address,
  });

  // create ReferralRewardManager instance
  const referralRewardManagerContract = await hre.ethers.getContractAt(
    "ReferralRewardManager",
    referralRewardManagerDeployed.address,
  );

  await referralRewardManagerContract.setAuctionBot(auctionBotContract.address);

  await deploy(depositAndPlaceOrder, {
    from: deployer,
    gasLimit: 8000000,
    args: [auctionBotContract.address, wethAddress],
    log: true,
  });
};

export default deployAuctionBot;
deployAuctionBot.tags = ["AuctionBot"];
deployAuctionBot.dependencies = ["AuctionToken"];
