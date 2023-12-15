import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
import { utils } from "ethers";
import "hardhat-contract-sizer";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HttpNetworkUserConfig } from "hardhat/types";
import yargs from "yargs";

import jsonEnv from "../../config/config.dev.json";

import { clearAuction } from "./src/tasks/clear_auction";
import { clearAuctionSimplified } from "./src/tasks/clear_auction_simplifed";
import { createTestToken } from "./src/tasks/create_new_test_token";
import { createTestToken6 } from "./src/tasks/create_token_6_dec";
import { createVestingStrategy } from "./src/tasks/create_vesting_strategy";
import { createTokenFactory } from "./src/tasks/deploy_token_deployer";
import { createLiqPool } from "./src/tasks/dex/create_lp";
import { performSwap } from "./src/tasks/dex/perform_swap";
import { executeDistribution } from "./src/tasks/distribution";
import { initiateAuction } from "./src/tasks/initiate_new_auction";
import { mintBiddingToken } from "./src/tasks/mint_bidding_token";
import { placeManyOrders } from "./src/tasks/placeManyOrders";
import { sendEthAuctionToken } from "./src/tasks/send_eth_auction_token";
import { transferAuctionToken } from "./src/tasks/transfer_auction_token";
import { updateFeeReceiver } from "./src/tasks/update_fee_receiver";

const argv = yargs
  .option("network", {
    type: "string",
    default: "hardhat",
  })
  .help(false)
  .version(false).argv;

// Load environment variables.
dotenv.config();
const { GAS_PRICE_GWEI, ALCHEMY_API_KEY, MNEMONIC, MY_ETHERSCAN_API_KEY } =
  process.env;

const DEFAULT_MNEMONIC =
  "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

const sharedNetworkConfig: HttpNetworkUserConfig = {};

const PK = jsonEnv.PRIVATE_KEY;

if (PK) {
  sharedNetworkConfig.accounts = [PK];
} else {
  sharedNetworkConfig.accounts = {
    mnemonic: MNEMONIC || DEFAULT_MNEMONIC,
  };
}

if (
  ["rinkeby", "goerli", "mainnet"].includes(argv.network) &&
  ALCHEMY_API_KEY === undefined
) {
  throw new Error(
    `Could not find Infura key in env, unable to connect to network ${argv.network}`,
  );
}

initiateAuction();
clearAuction();
clearAuctionSimplified();
createVestingStrategy();
placeManyOrders();
createTestToken();
createTokenFactory();
createLiqPool();
mintBiddingToken();
transferAuctionToken();
sendEthAuctionToken();
updateFeeReceiver();
performSwap();
executeDistribution();
createTestToken6();

export default {
  paths: {
    artifacts: "build/artifacts",
    cache: "build/cache",
    deploy: "src/deploy",
    sources: "contracts",
  },
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
        blockNumber: 18527575,
      },
      accounts: {
        count: 100,
        accountsBalance: "1000000000000000000000000000000",
      },
    },
    mainnet: {
      ...sharedNetworkConfig,
      url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      gasPrice: GAS_PRICE_GWEI
        ? parseInt(
            utils.parseUnits(GAS_PRICE_GWEI.toString(), "gwei").toString(),
          )
        : "auto",
    },
    goerli: {
      ...sharedNetworkConfig,
      url: `https://arb-goerli.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      chainId: 421613,
      timeout: 18000000,
      gasPrice: "auto",
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  mocha: {
    timeout: 2000000,
  },
  etherscan: {
    apiKey: MY_ETHERSCAN_API_KEY,
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 21,
  },
};
