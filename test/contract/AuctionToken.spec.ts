import { JsonRpcProvider } from "@ethersproject/providers";
import "@nomiclabs/hardhat-ethers";
import { expect } from "chai";
import { Contract } from "ethers";
import { deployments, ethers, waffle } from "hardhat";
import { setupTest } from "./utilities";

describe("AuctionToken", async () => {
  const [owner, user1, user2] = waffle.provider.getWallets();
  let auctionToken: Contract;
  const totalSupply = ethers.utils.parseUnits("1000000", 18); // Adjust if your token has a different supply
  let provider: JsonRpcProvider;
  let teamWallet: string;
  let revShareWallet: string;
  let uniswapPair: Contract;
  let weth: Contract;

  beforeEach(async () => {
    await deployments.fixture("AuctionBot");
    const setup = await setupTest();
    auctionToken = setup.auctionToken;
    teamWallet = setup.teamWallet.address;
    revShareWallet = setup.revShareWallet.address;
    provider = ethers.provider;

    // add liquidity to the uniswap v2 pair
    const uniswapV2Router = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
    const uniswapV2RouterContract = await ethers.getContractAt(
      "IUniswapV2Router02",
      uniswapV2Router,
    );
    const amountETH = ethers.utils.parseEther("1000");
    auctionToken.approve(uniswapV2Router, amountETH.mul(100));
    await uniswapV2RouterContract.addLiquidityETH(
      auctionToken.address,
      amountETH.mul(100),
      0,
      0,
      owner.address,
      Date.now() + 100000000,
      { value: amountETH },
    );

    uniswapPair = await ethers.getContractAt(
      "IUniswapV2Pair",
      await auctionToken.uniswapV2Pair(),
    );

    weth = setup.weth;
  });

  describe("initiate Token", async () => {
    it("should have the correct data", async () => {
      // console.log(owner.address);
      const name = await auctionToken.name();
      const symbol = await auctionToken.symbol();
      const decimals = await auctionToken.decimals();
      const totalSupply = await auctionToken.totalSupply();
      expect(name).to.equal("Auction");
      expect(symbol).to.equal("AUCTION");
      expect(decimals).to.equal(18);
      expect(totalSupply).to.equal(ethers.utils.parseEther("1000000"));
    });

    it("should have the correct owner", async () => {
      const ownerContract = await auctionToken.owner();
      expect(ownerContract).to.equal(owner.address);
    });

    it("should create the AUCTION/ETH pair", async () => {
      const pair = await auctionToken.uniswapV2Pair();

      // verify that there is bytecode at the pair address
      const bytecode = await ethers.provider.getCode(pair);
      expect(bytecode).to.not.equal("0x");
    });

    it("should successfully mint the total supply to the owner on deployment", async () => {
      const ownerBalance = await auctionToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(
        totalSupply.sub(ethers.utils.parseEther("1000").mul(100)),
      );
    });

    it("should return correct balances after transfer", async () => {
      const transferAmount = ethers.utils.parseUnits("100", 18);
      // Transfer tokens from owner to user_1
      await auctionToken.transfer(user1.address, transferAmount);
      expect(await auctionToken.balanceOf(user1.address)).to.equal(
        transferAmount,
      );
    });

    it("should fail to transfer more tokens than the balance of a holder", async () => {
      const transferAmount = ethers.utils.parseUnits("1000001", 18); // More than total supply
      await expect(
        auctionToken.connect(user1).transfer(user2.address, transferAmount),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should allow approval and transfer of tokens from a third party", async () => {
      const transferAmount = ethers.utils.parseUnits("100", 18);
      // Owner approves user_1 to spend tokens
      await auctionToken.approve(user1.address, transferAmount);
      // user_1 transfers from owner to user_2
      await auctionToken
        .connect(user1)
        .transferFrom(owner.address, user2.address, transferAmount);
      expect(await auctionToken.balanceOf(user2.address)).to.equal(
        transferAmount,
      );
    });

    it("should not allow transfer from an unapproved third party", async () => {
      const transferAmount = ethers.utils.parseUnits("100", 18);
      // user_1 tries to transfer from owner to user_2 without approval
      await expect(
        auctionToken
          .connect(user1)
          .transferFrom(owner.address, user2.address, transferAmount),
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  describe("Fees and Distribution", async () => {
    it("should not distribute if below threshold transfer", async function () {
      // Arrange
      const transferAmount = ethers.utils.parseEther("1000");
      await auctionToken.connect(owner).transfer(user1.address, transferAmount);

      // Act
      expect(
        await auctionToken
          .connect(user1)
          .transfer(user2.address, transferAmount),
      ).not.to.emit(auctionToken, "Distribution");
    });

    it("should distribute if above threshold transfer", async function () {
      // send eth to contract
      const transferAmount = ethers.utils.parseEther("1");
      await owner.sendTransaction({
        to: auctionToken.address,
        value: transferAmount,
      });

      await auctionToken
        .connect(owner)
        .transfer(user1.address, ethers.utils.parseEther("1000"));

      // Act
      expect(
        await auctionToken
          .connect(user1)
          .transfer(user2.address, transferAmount),
      ).to.emit(auctionToken, "Distribution");
    });

    it("should distribute when owner calls exectuteDistribution", async function () {
      // send eth to contract
      const transferAmount = ethers.utils.parseEther("1");
      await owner.sendTransaction({
        to: auctionToken.address,
        value: transferAmount,
      });

      const initialBalances = await Promise.all([
        provider.getBalance(teamWallet),
        provider.getBalance(revShareWallet),
        weth.balanceOf(uniswapPair.address),
        uniswapPair.balanceOf(owner.address),
      ]);

      expect(await await auctionToken.executeDistribution()).to.emit(
        auctionToken,
        "Distribution",
      );

      // Assert
      const newBalances = await Promise.all([
        provider.getBalance(teamWallet),
        provider.getBalance(revShareWallet),
        weth.balanceOf(uniswapPair.address),
        uniswapPair.balanceOf(owner.address),
      ]);

      const revShareFee = await auctionToken.revShareFee();
      const teamFee = await auctionToken.teamFee();
      const base = await auctionToken.BASE();

      expect(newBalances[0].sub(initialBalances[0])).to.be.eq(
        transferAmount.mul(revShareFee).div(base),
      );
      expect(newBalances[1].sub(initialBalances[1])).to.be.eq(
        transferAmount.mul(teamFee).div(base),
      );

      expect(newBalances[2]).to.be.gt(initialBalances[2]);
      expect(newBalances[3]).to.be.gt(initialBalances[3]);
    });

    it("should update total fees after setting individual fees", async function () {
      // Arrange
      const newRevShareFee = 3;
      const newBuybackFee = 2;
      const newLpFee = 1;
      const newTeamFee = 4;

      // Act
      await auctionToken.setFees(
        newRevShareFee,
        newBuybackFee,
        newLpFee,
        newTeamFee,
      );

      // Assert
      const totalFee = await auctionToken.totalFee();
      const expectedTotalFee =
        newRevShareFee + newBuybackFee + newLpFee + newTeamFee;
      expect(totalFee).to.equal(expectedTotalFee);
    });

    it("should not allow non-owner to set fees", async function () {
      await expect(
        auctionToken.connect(user1).setFees(1, 2, 3, 4),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("stuck balance", async () => {
    it("should allow the owner to recover stuck Ether", async function () {
      // Arrange - send some Ether to the contract address
      const sendValue = ethers.utils.parseEther("1.0"); // 1 Ether
      await user1.sendTransaction({
        to: auctionToken.address,
        value: sendValue,
      });

      // Act - attempt to recover the stuck Ether
      const initialOwnerBalance = await provider.getBalance(owner.address);
      await auctionToken.connect(owner).withdrawStuckEth(owner.address);

      // Assert - check if the Ether balance of the owner has increased by the expected amount
      const finalOwnerBalance = await provider.getBalance(owner.address);
      expect(finalOwnerBalance.sub(initialOwnerBalance)).to.be.closeTo(
        sendValue /* gas cost */,
        ethers.utils.parseUnits("0.1", 18),
      );
    });

    it("should allow the owner to recover stuck ERC20 tokens", async function () {
      const sendAmount = ethers.utils.parseUnits("1000", 18); // 1000 tokens
      await auctionToken.transfer(auctionToken.address, sendAmount);

      // Act - attempt to recover the stuck tokens
      const initialOwnerTokenBalance = await auctionToken.balanceOf(
        owner.address,
      );
      await auctionToken
        .connect(owner)
        .withdrawStuckToken(auctionToken.address, owner.address);

      // Assert - check if the ERC20 token balance of the owner has increased by the expected amount
      const finalOwnerTokenBalance = await auctionToken.balanceOf(
        owner.address,
      );
      expect(finalOwnerTokenBalance.sub(initialOwnerTokenBalance)).to.equal(
        sendAmount,
      );
    });
  });
});
