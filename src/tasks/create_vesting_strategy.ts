import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { task } from "hardhat/config";

import { BigNumber } from "ethers";
import { getEasyAuctionContract } from "./utils";

const createVestingStrategy: () => void = () => {
  task("createVestingStrategy", "Starts a new auction").setAction(
    async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const easyAuction = await getEasyAuctionContract(hardhatRuntime);

      const TokenVestingFactory =
        await hardhatRuntime.ethers.getContractFactory("TokenVestingFactory");
      const tokenVestingFactory = await TokenVestingFactory.deploy(
        easyAuction.address,
        {
          minCliffDuration: BigNumber.from("86400"), //1 day
          maxCliffDuration: BigNumber.from("2592000"), //30 days
          minVestDuration: BigNumber.from("5184000"), //60 days
          maxVestDuration: BigNumber.from("31536000"), //1 year
        },
      );

      await easyAuction.addStrategy(tokenVestingFactory.address);
      console.log("Strategy Address: ", tokenVestingFactory.address);
    },
  );
};
export { createVestingStrategy };
