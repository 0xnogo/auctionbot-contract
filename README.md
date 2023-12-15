# AuctionBot Backend

## Use cases

TBD

## Instructions

### Backend

Install dependencies

```
git clone https://github.com/gnosis/ido-contracts
cd ido-contracts
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

Verify on etherscan:

```
npx hardhat etherscan-verify --license None --network rinkeby
```

## Running scripts

### Create auctions

New auctions can be started with a hardhat script or via a safe app. The safe-app can be found here: [Auction-Starter](https://github.com/gnosis/ido-starter)
A new auction selling the token `0xc778417e063141139fce010982780140aa0cd5ab` for `0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa` can be started using the hardhat script like that:

```
export NETWORK=<Your Network>
export GAS_PRICE_GWEI=<Your gas price>
export INFURA_KEY=<Your infura key>
export PK=<Your private key>
yarn hardhat initiateAuction --auctioning-token "0xc778417e063141139fce010982780140aa0cd5ab" --bidding-token "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa" --sell-amount 0.1 --min-buy-amount 50 --network $NETWORK
```

Please look in the hardhat script `/src/tasks/initiate_new_auction` to better understand all parameters.

A more complex example for starting an auction would look like this:

```
yarn hardhat initiateAuction --auctioning-token "0xc778417e063141139fce010982780140aa0cd5ab" --bidding-token "0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea" --sell-amount 0.5 --min-buy-amount 800 --auction-end-date 1619195139 --order-cancellation-end-date 1619195139 --allow-list-manager "0x80b8AcA4689EC911F048c4E0976892cCDE14031E" --allow-list-data "0x000000000000000000000000740a98f8f4fae0986fb3264fe4aacf94ac1ee96f"  --network $NETWORK
```

### Settle auctions

Auctions can be settled with the clearAuction script permissionlessly by any account:

```
export NETWORK=<Your Network>
export GAS_PRICE_GWEI=<Your gas price>
export INFURA_KEY=<Your infura key>
export PK=<Your private key>
yarn hardhat clearAuction --auction-id <Your auction ID> --network $NETWORK
```

### Allow-Listing: Generating signatures

Signatures for an auction with participation restriction can be created like that:

1. Create a file: `your_address_inputs.txt` with comma separated addresses that should be allow-listed for the auction
2. Initiate the auction and remember your auctionId
3. Run the following script:

```
export NETWORK=<Your Network>
export INFURA_KEY=<Your infura key>
export PK=<Your private key _for the signing address_. The address for this key should not hold any ETH>
yarn hardhat generateSignatures --auction-id "Your auctionId" --file-with-address "./your_address_inputs.txt" --network $NETWORK
```

The generated signatures can be directly uploaded to the backend by adding the flag `--post-to-api` - or `--post-to-dev-api` in case you are testing with [development environment](https://ido-ux.dev.gnosisdev.com/#/) - to the previous command. Uploading signatures allows all authorized users to create orders from the web interface without the extra friction of managing a signature.

## Audit

The solidity code was audited by Adam Kolar, from the G0 Group. The report can be found [here](https://github.com/g0-group/Audits/blob/master/GnosisAuctionFeb2021.pdf) and [here](https://github.com/g0-group/Audits/blob/master/GnosisAuctionMar2021.pdf).
