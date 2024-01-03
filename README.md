# AuctionBot Contract

## Description

AuctionBot is a Telegram bot designed to enable projects to fundraise through the creation of batch auctions. This auction mechanism draws inspiration from Gnosis EasyAuction (https://github.com/gnosis/ido-contracts).

With AuctionBot, projects have the capability to set up an auction for any ERC20 token (the token being auctioned) against WETH/USDC/USDT/DAI (the tokens being bid). These auctions are time-bound, and anyone can place a bid at a specific maximum price. Additionally, bidders have the option to retract their bids before a predetermined deadline.

The auction's settlement process begins when the auction owner arranges the bids in ascending order, starting from the lowest. The auction is then fulfilled in reverse order until the entire quantity of the auctioned tokens has been allocated. The price of the final bid in this sequence establishes the auction's clearing price.

![Untitled](https://prod-files-secure.s3.us-west-2.amazonaws.com/94e77903-0acc-42f6-b16a-7446c357adb1/a437681d-7946-4b77-8f59-1de9bff342d1/Untitled.png)

AuctionBot incorporates a tiered fee structure applied to the total amount raised, with the fee percentage determined by the auction's total value in USD, spread across five different tiers. The collected fees are allocated among three distinct areas: the team, revenue sharing, and the Buyback & Liquidity Pool (LP) fund.

During the auction's settlement phase, these fees are calculated and then converted (either swapped or unwrapped) into ETH. This conversion is processed through the Auction token contract, which is also tasked with creating the liquidity pool and managing the distribution of these funds.

The distribution of fees is conducted through the **`transfer`** method of the Auction token contract. This distribution process is automatically triggered either after the contract's balance reaches a specific threshold or can be manually initiated at any time by the contract's owner. This mechanism ensures that the fees are efficiently and transparently allocated to their designated purposes as per the auction's underlying framework.
In AuctionBot's revenue sharing mechanism, the ETH generated from fees is stored in an Externally Owned Account (EOA). The distribution of this revenue to token holders is managed through an asynchronous process.

![Screenshot 2023-11-29 at 23.34.14.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/94e77903-0acc-42f6-b16a-7446c357adb1/c7a257f6-e7aa-4082-8d6a-55cb6e6d768c/Screenshot_2023-11-29_at_23.34.14.png)

## Flow

https://drive.google.com/file/d/1nPbbNonhCKPeWnCp1fHCsiQM0fPJ4FfN/view?usp=drive_web

## Instructions

### Backend

Install dependencies

```
yarn
yarn build
```

Running tests:

```
yarn test
```

Run migration:

```
yarn deploy --network $NETWORK
```