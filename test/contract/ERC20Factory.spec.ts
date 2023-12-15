import { expect } from "chai";
import { Contract, ContractFactory, Signer } from "ethers";
import { ethers } from "hardhat";

describe("ERC20Factory", function () {
  let ERC20Factory: ContractFactory;
  let CustomERC20: ContractFactory;
  let factory: Contract;
  let owner: Signer;
  let addr1: Signer;

  beforeEach(async () => {
    ERC20Factory = await ethers.getContractFactory("ERC20Factory");
    CustomERC20 = await ethers.getContractFactory("CustomERC20");
    [owner, addr1] = await ethers.getSigners();

    factory = await ERC20Factory.deploy();
    await factory.deployed();
  });

  it("Should deploy ERC20 token with specified parameters", async () => {
    const name = "TestToken";
    const symbol = "TST";
    const cap = ethers.utils.parseUnits("1000", 18);

    const deployTx = await factory.deployERC20(name, symbol, cap);
    const receipt = await deployTx.wait();

    const event = receipt.events?.find((e) => e.event === "ERC20Deployed");
    expect(event).to.exist;

    const deployedTokenAddress = event?.args?.erc20Address;
    const token = CustomERC20.attach(deployedTokenAddress as string);

    expect(await token.name()).to.equal(name);
    expect(await token.symbol()).to.equal(symbol);
    expect(await token.cap()).to.equal(cap);
    expect(await token.totalSupply()).to.equal(cap);
    expect(await token.balanceOf(owner.address)).to.equal(cap);
  });

  it("Should allow other accounts to deploy new tokens", async () => {
    const name = "AnotherToken";
    const symbol = "ATK";
    const cap = ethers.utils.parseUnits("500", 18);

    const deployTx = await factory.deployERC20(name, symbol, cap);
    const receipt = await deployTx.wait();
    const event = receipt.events?.find((e) => e.event === "ERC20Deployed");
    expect(event).to.exist;

    // Extract arguments from the event
    const {
      deployer,
      name: eventName,
      symbol: eventSymbol,
      initialAmount,
    } = event?.args || {};

    // Validate arguments
    expect(deployer).to.equal(owner.address);
    expect(eventName).to.equal(name);
    expect(eventSymbol).to.equal(symbol);
    expect(initialAmount).to.equal(cap);
  });

  it("Should reject deployment with zero initial supply", async () => {
    await expect(factory.deployERC20("ZeroToken", "ZT", 0)).to.be.revertedWith(
      "ERC20Capped: cap is 0",
    );
  });

  it("Should allow token transfers between accounts", async () => {
    const name = "TransferToken";
    const symbol = "TFT";
    const cap = ethers.utils.parseUnits("1000", 18);

    const deployTx = await factory.deployERC20(name, symbol, cap);
    const receipt = await deployTx.wait();
    const event = receipt.events?.find((e) => e.event === "ERC20Deployed");
    const deployedTokenAddress = event?.args?.erc20Address;
    const token = CustomERC20.attach(deployedTokenAddress as string);

    const transferAmount = ethers.utils.parseUnits("250", 18);
    await token.transfer(addr1.address, transferAmount);
    expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
    expect(await token.balanceOf(owner.address)).to.equal(
      cap.sub(transferAmount),
    );
  });
  it("Should correctly emit the ERC20Deployed event with accurate details", async () => {
    const name = "EventToken";
    const symbol = "EVT";
    const cap = ethers.utils.parseUnits("777", 18);

    const deployTx = await factory.deployERC20(name, symbol, cap);
    const receipt = await deployTx.wait();
    const event = receipt.events?.find((e) => e.event === "ERC20Deployed");
    expect(event).to.exist;

    // Extract arguments from the event
    const {
      deployer,
      name: eventName,
      symbol: eventSymbol,
      initialAmount,
    } = event?.args || {};

    // Validate arguments
    expect(deployer).to.equal(owner.address);
    expect(eventName).to.equal(name);
    expect(eventSymbol).to.equal(symbol);
    expect(initialAmount).to.equal(cap);
  });
});
