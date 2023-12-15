import "@nomiclabs/hardhat-ethers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers, waffle } from "hardhat";
import { setupTest } from "./utilities";

describe("ReferralRewardManager", async () => {
  const [admin, user1, user2] = waffle.provider.getWallets();
  let referralRewardManager: Contract;
  let weth: Contract;
  beforeEach(async () => {
    const setup = await setupTest();

    referralRewardManager = setup.referralRewardManager;
    weth = setup.weth;

    await weth.deposit({ value: ethers.utils.parseEther("100000") });
  });

  describe("initialize", async () => {
    it("should setAuctionBot", async () => {
      // new credit auction address
      const newAuctionBot = ethers.Wallet.createRandom().address;
      // set credit auction
      await referralRewardManager.setAuctionBot(newAuctionBot);

      // check credit auction
      expect(await referralRewardManager.auctionBot()).to.equal(newAuctionBot);
    });

    it("should have withdraw closed", async () => {
      // check withdraw closed
      expect(await referralRewardManager.withdrawOpen()).to.equal(false);

      // open withdraw
      await referralRewardManager.openWithdraw();

      // check withdraw open
      expect(await referralRewardManager.withdrawOpen()).to.equal(true);
    });
  });

  describe("register code", async () => {
    it("should register code", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // check code
      expect(await referralRewardManager.codeToAddress("code")).to.equal(
        user1.address,
      );
      expect(await referralRewardManager.addressToCode(user1.address)).to.equal(
        "code",
      );
    });

    it("should not register code if code is already registered", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // check code
      expect(
        await referralRewardManager.connect(user1).codeToAddress("code"),
      ).to.equal(user1.address);
      expect(await referralRewardManager.addressToCode(user1.address)).to.equal(
        "code",
      );

      // try to register code again
      await expect(
        referralRewardManager.connect(user1).registerCode("code"),
      ).to.be.revertedWith(
        "ReferralRewardManager: code already registered or address already has code",
      );

      // another address tries to register code
      await expect(
        referralRewardManager.connect(user2).registerCode("code"),
      ).to.be.revertedWith(
        "ReferralRewardManager: code already registered or address already has code",
      );
    });

    it("should not register code if code is empty", async () => {
      // try to register code
      await expect(
        referralRewardManager.connect(user1).registerCode(""),
      ).to.be.revertedWith("ReferralRewardManager: code cannot be empty");
    });

    it("should not register code if code is above 8 characters", async () => {
      // try to register code
      await expect(
        referralRewardManager.connect(user1).registerCode("123456789"),
      ).to.be.revertedWith("ReferralRewardManager: code cannot be above 8");
    });
  });

  describe("withdraw", async () => {
    it("should withdraw", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // send eth1 to user1
      await referralRewardManager
        .connect(admin)
        .addToBalance("code", ethers.utils.parseEther("1"), weth.address);

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(ethers.utils.parseEther("1"));

      // register code
      await referralRewardManager.connect(user2).registerCode("code2");

      // send eth to user2
      await referralRewardManager
        .connect(admin)
        .addToBalance("code2", ethers.utils.parseEther("0.5"), weth.address);

      // check balance
      expect(
        await referralRewardManager.balances(user2.address, weth.address),
      ).to.equal(ethers.utils.parseEther("0.5"));

      // send weth to referralRewardManager
      await weth
        .connect(admin)
        .transfer(
          referralRewardManager.address,
          ethers.utils.parseEther("1.5"),
        );

      // open withdraw
      await referralRewardManager.openWithdraw();
      // withdraw
      await expect(() =>
        referralRewardManager
          .connect(user1)
          .withdraw(ethers.utils.parseEther("1"), weth.address),
      ).changeTokenBalance(weth, user1, ethers.utils.parseEther("1"));

      await expect(() =>
        referralRewardManager
          .connect(user2)
          .withdraw(ethers.utils.parseEther("0.5"), weth.address),
      ).changeTokenBalance(weth, user2, ethers.utils.parseEther("0.5"));

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(0);
      expect(
        await referralRewardManager.balances(user2.address, weth.address),
      ).to.equal(0);
    });

    it("should reduce the balance when user not withdraw all", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // send eth1 to user1
      await referralRewardManager
        .connect(admin)
        .addToBalance("code", ethers.utils.parseEther("1"), weth.address);

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(ethers.utils.parseEther("1"));

      // send weth to referralRewardManager
      await weth
        .connect(admin)
        .transfer(
          referralRewardManager.address,
          ethers.utils.parseEther("1.5"),
        );

      // open withdraw
      await referralRewardManager.openWithdraw();

      // withdraw
      await expect(() =>
        referralRewardManager
          .connect(user1)
          .withdraw(ethers.utils.parseEther("0.5"), weth.address),
      ).changeTokenBalance(weth, user1, ethers.utils.parseEther("0.5"));

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(ethers.utils.parseEther("0.5"));
    });

    it("should not withdraw if user has not enough balance", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // send eth1 to user1
      await referralRewardManager
        .connect(admin)
        .addToBalance("code", ethers.utils.parseEther("1"), weth.address);

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(ethers.utils.parseEther("1"));

      // send weth to referralRewardManager
      await weth
        .connect(admin)
        .transfer(
          referralRewardManager.address,
          ethers.utils.parseEther("1.5"),
        );

      // open withdraw
      await referralRewardManager.openWithdraw();

      // withdraw
      await expect(
        referralRewardManager
          .connect(user1)
          .withdraw(ethers.utils.parseEther("1.1"), weth.address),
      ).to.be.revertedWith("ReferralRewardManager: insufficient balance");
    });

    it("should not withdraw if user is not registered", async () => {
      // open withdraw
      await referralRewardManager.openWithdraw();

      // withdraw
      await expect(
        referralRewardManager
          .connect(user1)
          .withdraw(ethers.utils.parseEther("1"), weth.address),
      ).to.be.revertedWith("ReferralRewardManager: insufficient balance");
    });

    it("should revert when withdrawing 0", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // send eth1 to user1
      await referralRewardManager
        .connect(admin)
        .addToBalance("code", ethers.utils.parseEther("1"), weth.address);

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(ethers.utils.parseEther("1"));

      // send weth to referralRewardManager
      await weth
        .connect(admin)
        .transfer(
          referralRewardManager.address,
          ethers.utils.parseEther("1.5"),
        );
      // open withdraw
      await referralRewardManager.openWithdraw();

      // withdraw
      await expect(
        referralRewardManager
          .connect(user1)
          .withdraw(ethers.utils.parseEther("0"), weth.address),
      ).to.be.revertedWith("ReferralRewardManager: amount cannot be 0");
    });

    it("should not withdraw if closed", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // send eth1 to user1
      await referralRewardManager
        .connect(admin)
        .addToBalance("code", ethers.utils.parseEther("1"), weth.address);

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(ethers.utils.parseEther("1"));

      // send weth to referralRewardManager
      await weth
        .connect(admin)
        .transfer(
          referralRewardManager.address,
          ethers.utils.parseEther("1.5"),
        );

      // withdraw
      await expect(
        referralRewardManager
          .connect(user1)
          .withdraw(ethers.utils.parseEther("1"), weth.address),
      ).to.be.revertedWith("ReferralRewardManager: withdraw not open");
    });
  });

  describe("addToBalance", async () => {
    it("should add to balance", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // send eth1 to user1
      await referralRewardManager
        .connect(admin)
        .addToBalance("code", ethers.utils.parseEther("1"), weth.address);

      // check balance
      expect(
        await referralRewardManager.balances(user1.address, weth.address),
      ).to.equal(ethers.utils.parseEther("1"));
    });

    it("should not add to balance if user is not registered", async () => {
      // send eth1 to user1
      await expect(
        referralRewardManager
          .connect(admin)
          .addToBalance("code", ethers.utils.parseEther("1"), weth.address),
      ).to.be.revertedWith("ReferralRewardManager: code not registered");
    });

    it("should fail if sender is not admin or auction", async () => {
      // register code
      await referralRewardManager.connect(user1).registerCode("code");

      // send eth1 to user1
      await expect(
        referralRewardManager
          .connect(user1)
          .addToBalance("code", ethers.utils.parseEther("1"), weth.address),
      ).to.be.revertedWith("ReferralRewardManager: unauthorized");
    });
  });
});
