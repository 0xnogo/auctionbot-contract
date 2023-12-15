import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

import { createTokensAndMintAndApprove } from "../../src/priceCalculation";

import { getEasyAuctionContract } from "./utils";

const createTestToken: () => void = () => {
  task("createTestToken", "Starts a new auction").setAction(
    async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const easyAuction = await getEasyAuctionContract(hardhatRuntime);

      const { auctioningToken, biddingToken } =
        await createTokensAndMintAndApprove(
          easyAuction,
          [caller],
          hardhatRuntime,
        );
      console.log(
        "Following tokens were created: ",
        auctioningToken.address,
        "and",
        biddingToken.address,
      );
    },
  );
};
export { createTestToken };

// npx hardhat createTestToken --network localhost
