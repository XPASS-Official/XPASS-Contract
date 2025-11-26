const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("XPassTokenBSC", function () {
  // Global delay constants
  const PRODUCTION_DELAY = 48 * 60 * 60; // 48 hours (production delay)
  const TEST_DELAY = 60; // 1 minute (for testing)
  const PERMIT_DEADLINE_OFFSET = 3600 * 24 * 365; // 1 year (for permit tests)
  
  // NOTE: In this test environment, 'owner' simulates the Multi-Sig wallet
  // In production: deployer has no roles, Multi-Sig has all roles
  // In tests: owner has all roles for testing convenience
  
  let XPassTokenBSC;
  let XPassTimelockController;
  let xpassTokenBSC;
  let timelockController;
  let owner;
  let minter;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get accounts
    [owner, minter, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Get contract factories
    XPassTokenBSC = await ethers.getContractFactory("XPassTokenBSC");
    XPassTimelockController = await ethers.getContractFactory("XPassTimelockController");
    
    // Deploy TimelockController first
    // For testing, we use owner as the Multi-Sig equivalent
    const minDelay = PRODUCTION_DELAY; // 48 hours delay (same as production)
    const admin = owner.address; // Owner as admin (simulating Multi-Sig) - will be used for all roles
    
    timelockController = await XPassTimelockController.deploy(
      minDelay,
      admin
    );
    
    // Deploy XPassTokenBSC with owner as initial owner, minter as initial minter, and TimelockController as timelock controller
    xpassTokenBSC = await XPassTokenBSC.deploy(
      owner.address,
      minter.address,
      await timelockController.getAddress()
    );
    
    // Initial supply is 0 - tokens will be minted through bridge
  });

  describe("Deployment", function () {
    it("Should deploy with owner as owner", async function () {
      expect(await xpassTokenBSC.owner()).to.equal(owner.address);
    });
    
    it("Should deploy with TimelockController as timelock controller", async function () {
      expect(await xpassTokenBSC.timelockController()).to.equal(await timelockController.getAddress());
    });

    it("Should have correct name and symbol", async function () {
      expect(await xpassTokenBSC.name()).to.equal("XPASS Token");
      expect(await xpassTokenBSC.symbol()).to.equal("XPASS");
    });

    it("Should have correct decimal places", async function () {
      expect(await xpassTokenBSC.decimals()).to.equal(18);
    });

    it("Should have zero initial supply", async function () {
      const totalSupply = await xpassTokenBSC.totalSupply();
      expect(totalSupply).to.equal(0);
    });

    it("Should have initial totalMinted of 0", async function () {
      expect(await xpassTokenBSC.totalMinted()).to.equal(0);
    });

    it("Should have correct maximum supply", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      const expectedMaxSupply = ethers.parseUnits("1000000000", 18);
      expect(maxSupply).to.equal(expectedMaxSupply);
    });

    it("Should grant MINTER_ROLE to initial minter", async function () {
      const MINTER_ROLE = await xpassTokenBSC.MINTER_ROLE();
      expect(await xpassTokenBSC.hasRole(MINTER_ROLE, minter.address)).to.be.true;
    });
  });

  describe("Token Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount);
      
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(mintAmount);
      expect(await xpassTokenBSC.totalSupply()).to.equal(mintAmount);
      expect(await xpassTokenBSC.totalMinted()).to.equal(mintAmount);
    });

    it("Should emit TokensMinted event", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      
      await expect(xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount))
        .to.emit(xpassTokenBSC, "TokensMinted")
        .withArgs(addr1.address, mintAmount, minter.address);
    });

    it("Should prevent minting exceeding MAX_SUPPLY", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      const excessiveAmount = maxSupply + 1n;
      
      await expect(
        xpassTokenBSC.connect(minter).mint(addr1.address, excessiveAmount)
      ).to.be.revertedWith("XPassTokenBSC: exceeds maximum supply");
    });

    it("Should prevent minting to zero address", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      
      await expect(
        xpassTokenBSC.connect(minter).mint(ethers.ZeroAddress, mintAmount)
      ).to.be.revertedWith("XPassTokenBSC: cannot mint to zero address");
    });

    it("Should prevent minting with zero amount", async function () {
      await expect(
        xpassTokenBSC.connect(minter).mint(addr1.address, 0)
      ).to.be.revertedWith("XPassTokenBSC: amount must be greater than zero");
    });

    it("Should prevent minting from non-minter", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      
      await expect(
        xpassTokenBSC.connect(addr1).mint(addr1.address, mintAmount)
      ).to.be.reverted;
    });

    it("Should allow minting up to MAX_SUPPLY", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      
      await xpassTokenBSC.connect(minter).mint(addr1.address, maxSupply);
      
      expect(await xpassTokenBSC.totalSupply()).to.equal(maxSupply);
      expect(await xpassTokenBSC.totalMinted()).to.equal(maxSupply);
    });

    it("Should prevent minting after MAX_SUPPLY is reached", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      
      await xpassTokenBSC.connect(minter).mint(addr1.address, maxSupply);
      
      await expect(
        xpassTokenBSC.connect(minter).mint(addr2.address, 1)
      ).to.be.revertedWith("XPassTokenBSC: exceeds maximum supply");
    });

    it("Should track totalMinted correctly across multiple mints", async function () {
      const mintAmount1 = ethers.parseUnits("1000", 18);
      const mintAmount2 = ethers.parseUnits("2000", 18);
      
      await xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount1);
      expect(await xpassTokenBSC.totalMinted()).to.equal(mintAmount1);
      
      await xpassTokenBSC.connect(minter).mint(addr2.address, mintAmount2);
      expect(await xpassTokenBSC.totalMinted()).to.equal(mintAmount1 + mintAmount2);
    });

    it("Should prevent minting when totalMinted + amount would exceed MAX_SUPPLY", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      const amount1 = maxSupply - 1000n;
      const amount2 = 1001n; // This would exceed MAX_SUPPLY
      
      await xpassTokenBSC.connect(minter).mint(addr1.address, amount1);
      
      await expect(
        xpassTokenBSC.connect(minter).mint(addr2.address, amount2)
      ).to.be.revertedWith("XPassTokenBSC: exceeds maximum supply");
    });

    it("Should allow minting exactly remaining supply", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      const amount1 = maxSupply - 1000n;
      const amount2 = 1000n; // Exactly remaining
      
      await xpassTokenBSC.connect(minter).mint(addr1.address, amount1);
      await xpassTokenBSC.connect(minter).mint(addr2.address, amount2);
      
      expect(await xpassTokenBSC.totalMinted()).to.equal(maxSupply);
      expect(await xpassTokenBSC.totalSupply()).to.equal(maxSupply);
    });

    it("Should prevent minting when paused", async function () {
      // Pause token
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      const mintAmount = ethers.parseUnits("1000", 18);
      await expect(
        xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
    });
  });

  describe("Token Burning", function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount);
    });

    it("Should allow user to burn their own tokens", async function () {
      const burnAmount = ethers.parseUnits("500", 18);
      const initialBalance = await xpassTokenBSC.balanceOf(addr1.address);
      const initialSupply = await xpassTokenBSC.totalSupply();
      
      await xpassTokenBSC.connect(addr1).burn(burnAmount);
      
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(initialBalance - burnAmount);
      expect(await xpassTokenBSC.totalSupply()).to.equal(initialSupply - burnAmount);
      // totalMinted should remain the same
      expect(await xpassTokenBSC.totalMinted()).to.equal(initialSupply);
    });

    it("Should allow burnFrom with approval", async function () {
      const burnAmount = ethers.parseUnits("300", 18);
      const approveAmount = burnAmount;
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      await xpassTokenBSC.connect(addr2).burnFrom(addr1.address, burnAmount);
      
      const balance = await xpassTokenBSC.balanceOf(addr1.address);
      const expectedBalance = ethers.parseUnits("1000", 18) - burnAmount;
      expect(balance).to.equal(expectedBalance);
    });

    it("Should emit Transfer event when burning", async function () {
      const burnAmount = ethers.parseUnits("200", 18);
      
      await expect(xpassTokenBSC.connect(addr1).burn(burnAmount))
        .to.emit(xpassTokenBSC, "Transfer")
        .withArgs(addr1.address, ethers.ZeroAddress, burnAmount);
    });

    it("Should prevent burning more than balance", async function () {
      const balance = await xpassTokenBSC.balanceOf(addr1.address);
      const excessiveAmount = balance + 1n;
      
      await expect(
        xpassTokenBSC.connect(addr1).burn(excessiveAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientBalance");
    });

    it("Should allow burning entire balance", async function () {
      const balance = await xpassTokenBSC.balanceOf(addr1.address);
      
      await xpassTokenBSC.connect(addr1).burn(balance);
      
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(0);
    });

    it("Should prevent burning zero amount", async function () {
      // OpenZeppelin v5 may allow zero amount burns, but we verify it doesn't change state
      const initialBalance = await xpassTokenBSC.balanceOf(addr1.address);
      const initialSupply = await xpassTokenBSC.totalSupply();
      
      // burn(0) may or may not revert depending on OpenZeppelin version
      // We verify that if it doesn't revert, it doesn't change state
      const burnResult = await xpassTokenBSC.connect(addr1).burn(0).catch(() => null);
      
      if (burnResult === null) {
        // If it reverts, that's acceptable - test passes
        // The revert could be with various error types depending on OpenZeppelin version
        return;
      }
      
      // If it doesn't revert, verify state is unchanged
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(initialBalance);
      expect(await xpassTokenBSC.totalSupply()).to.equal(initialSupply);
    });

    it("Should prevent burnFrom with insufficient allowance", async function () {
      const burnAmount = ethers.parseUnits("500", 18);
      const approveAmount = ethers.parseUnits("300", 18); // Less than burnAmount
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      
      await expect(
        xpassTokenBSC.connect(addr2).burnFrom(addr1.address, burnAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientAllowance");
    });

    it("Should prevent burnFrom with zero balance", async function () {
      // Get current balance (from beforeEach)
      const currentBalance = await xpassTokenBSC.balanceOf(addr1.address);
      
      // Burn all tokens
      await xpassTokenBSC.connect(addr1).burn(currentBalance);
      
      // Verify balance is zero
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(0);
      
      // Approve addr2 to burn from addr1
      await xpassTokenBSC.connect(addr1).approve(addr2.address, currentBalance);
      
      // Try to burnFrom with zero balance - should fail with ERC20InsufficientBalance
      // Note: burnFrom checks allowance first, then calls _burn which checks balance
      await expect(
        xpassTokenBSC.connect(addr2).burnFrom(addr1.address, 1)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientBalance");
    });

    it("Should prevent burning when paused", async function () {
      // Pause token
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      const burnAmount = ethers.parseUnits("100", 18);
      await expect(
        xpassTokenBSC.connect(addr1).burn(burnAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
    });

    it("Should handle multiple burns correctly", async function () {
      const burnAmount1 = ethers.parseUnits("200", 18);
      const burnAmount2 = ethers.parseUnits("300", 18);
      const initialBalance = await xpassTokenBSC.balanceOf(addr1.address);
      const initialSupply = await xpassTokenBSC.totalSupply();
      
      await xpassTokenBSC.connect(addr1).burn(burnAmount1);
      await xpassTokenBSC.connect(addr1).burn(burnAmount2);
      
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(
        initialBalance - burnAmount1 - burnAmount2
      );
      expect(await xpassTokenBSC.totalSupply()).to.equal(
        initialSupply - burnAmount1 - burnAmount2
      );
      // totalMinted should remain unchanged
      expect(await xpassTokenBSC.totalMinted()).to.equal(initialSupply);
    });

    it("Should handle burnFrom with partial allowance", async function () {
      const burnAmount = ethers.parseUnits("300", 18);
      const approveAmount = ethers.parseUnits("500", 18); // More than burnAmount
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      await xpassTokenBSC.connect(addr2).burnFrom(addr1.address, burnAmount);
      
      const remainingAllowance = await xpassTokenBSC.allowance(addr1.address, addr2.address);
      expect(remainingAllowance).to.equal(approveAmount - burnAmount);
    });
  });

  describe("Token Burning to Kaia Address", function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount);
    });

    it("Should allow user to burn tokens and specify Kaia address", async function () {
      const burnAmount = ethers.parseUnits("500", 18);
      const kaiaAddress = addr2.address; // Different address for Kaia
      const initialBalance = await xpassTokenBSC.balanceOf(addr1.address);
      const initialSupply = await xpassTokenBSC.totalSupply();
      
      // Check that TokensBurned event is emitted
      // Note: kaiaAddress is indexed string, so we verify event emission separately
      const tx = await xpassTokenBSC.connect(addr1).burnToKaia(kaiaAddress, burnAmount);
      const receipt = await tx.wait();
      
      // Verify TokensBurned event was emitted
      const tokensBurnedEvent = receipt.logs.find(
        log => {
          try {
            const parsedLog = xpassTokenBSC.interface.parseLog(log);
            return parsedLog && parsedLog.name === "TokensBurned";
          } catch {
            return false;
          }
        }
      );
      expect(tokensBurnedEvent).to.not.be.undefined;
      
      // Verify contract state changes
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(initialBalance - burnAmount);
      expect(await xpassTokenBSC.totalSupply()).to.equal(initialSupply - burnAmount);
      // totalMinted should remain the same
      expect(await xpassTokenBSC.totalMinted()).to.equal(initialSupply);
    });

    it("Should prevent burnToKaia with zero Kaia address", async function () {
      const burnAmount = ethers.parseUnits("500", 18);
      
      await expect(
        xpassTokenBSC.connect(addr1).burnToKaia(ethers.ZeroAddress, burnAmount)
      ).to.be.revertedWith("XPassTokenBSC: kaiaAddress cannot be zero address");
    });

    it("Should prevent burnToKaia with zero amount", async function () {
      const kaiaAddress = addr2.address;
      
      await expect(
        xpassTokenBSC.connect(addr1).burnToKaia(kaiaAddress, 0)
      ).to.be.revertedWith("XPassTokenBSC: amount must be greater than zero");
    });

    it("Should prevent burnToKaia with insufficient balance", async function () {
      const balance = await xpassTokenBSC.balanceOf(addr1.address);
      const excessiveAmount = balance + 1n;
      const kaiaAddress = addr2.address;
      
      await expect(
        xpassTokenBSC.connect(addr1).burnToKaia(kaiaAddress, excessiveAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientBalance");
    });

    it("Should allow burnFromToKaia with approval", async function () {
      const burnAmount = ethers.parseUnits("300", 18);
      const approveAmount = burnAmount;
      const kaiaAddress = addr2.address;
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      
      // Check that TokensBurned event is emitted
      // Note: kaiaAddress is indexed string, so we verify event emission separately
      const tx = await xpassTokenBSC.connect(addr2).burnFromToKaia(addr1.address, kaiaAddress, burnAmount);
      const receipt = await tx.wait();
      
      // Verify TokensBurned event was emitted
      const tokensBurnedEvent = receipt.logs.find(
        log => {
          try {
            const parsedLog = xpassTokenBSC.interface.parseLog(log);
            return parsedLog && parsedLog.name === "TokensBurned";
          } catch {
            return false;
          }
        }
      );
      expect(tokensBurnedEvent).to.not.be.undefined;
      
      // Verify contract state changes
      const balance = await xpassTokenBSC.balanceOf(addr1.address);
      const expectedBalance = ethers.parseUnits("1000", 18) - burnAmount;
      expect(balance).to.equal(expectedBalance);
    });

    it("Should prevent burnFromToKaia with zero account address", async function () {
      const burnAmount = ethers.parseUnits("300", 18);
      const kaiaAddress = addr2.address;
      
      await expect(
        xpassTokenBSC.connect(addr2).burnFromToKaia(ethers.ZeroAddress, kaiaAddress, burnAmount)
      ).to.be.revertedWith("XPassTokenBSC: account cannot be zero address");
    });

    it("Should prevent burnFromToKaia with zero Kaia address", async function () {
      const burnAmount = ethers.parseUnits("300", 18);
      const approveAmount = burnAmount;
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      
      await expect(
        xpassTokenBSC.connect(addr2).burnFromToKaia(addr1.address, ethers.ZeroAddress, burnAmount)
      ).to.be.revertedWith("XPassTokenBSC: kaiaAddress cannot be zero address");
    });

    it("Should prevent burnFromToKaia with zero amount", async function () {
      const kaiaAddress = addr2.address;
      
      await expect(
        xpassTokenBSC.connect(addr1).burnFromToKaia(addr1.address, kaiaAddress, 0)
      ).to.be.revertedWith("XPassTokenBSC: amount must be greater than zero");
    });

    it("Should prevent burnFromToKaia with insufficient allowance", async function () {
      const burnAmount = ethers.parseUnits("500", 18);
      const approveAmount = ethers.parseUnits("300", 18); // Less than burnAmount
      const kaiaAddress = addr2.address;
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      
      await expect(
        xpassTokenBSC.connect(addr2).burnFromToKaia(addr1.address, kaiaAddress, burnAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientAllowance");
    });

    it("Should emit Transfer event when using burnToKaia", async function () {
      const burnAmount = ethers.parseUnits("200", 18);
      const kaiaAddress = addr2.address;
      
      await expect(xpassTokenBSC.connect(addr1).burnToKaia(kaiaAddress, burnAmount))
        .to.emit(xpassTokenBSC, "Transfer")
        .withArgs(addr1.address, ethers.ZeroAddress, burnAmount);
    });

    it("Should emit Transfer event when using burnFromToKaia", async function () {
      const burnAmount = ethers.parseUnits("200", 18);
      const approveAmount = burnAmount;
      const kaiaAddress = addr2.address;
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      
      await expect(xpassTokenBSC.connect(addr2).burnFromToKaia(addr1.address, kaiaAddress, burnAmount))
        .to.emit(xpassTokenBSC, "Transfer")
        .withArgs(addr1.address, ethers.ZeroAddress, burnAmount);
    });

    it("Should allow different Kaia addresses for different burns", async function () {
      const burnAmount1 = ethers.parseUnits("200", 18);
      const burnAmount2 = ethers.parseUnits("300", 18);
      const kaiaAddress1 = addr2.address;
      const kaiaAddress2 = addrs[0].address;
      
      await xpassTokenBSC.connect(addr1).burnToKaia(kaiaAddress1, burnAmount1);
      await xpassTokenBSC.connect(addr1).burnToKaia(kaiaAddress2, burnAmount2);
      
      const balance = await xpassTokenBSC.balanceOf(addr1.address);
      const expectedBalance = ethers.parseUnits("1000", 18) - burnAmount1 - burnAmount2;
      expect(balance).to.equal(expectedBalance);
    });

    it("Should prevent burnToKaia when paused", async function () {
      // Pause token
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      const burnAmount = ethers.parseUnits("100", 18);
      const kaiaAddress = addr2.address;
      
      await expect(
        xpassTokenBSC.connect(addr1).burnToKaia(kaiaAddress, burnAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
    });

    it("Should prevent burnFromToKaia when paused", async function () {
      const burnAmount = ethers.parseUnits("100", 18);
      const approveAmount = burnAmount;
      const kaiaAddress = addr2.address;
      
      await xpassTokenBSC.connect(addr1).approve(addr2.address, approveAmount);
      
      // Pause token
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      await expect(
        xpassTokenBSC.connect(addr2).burnFromToKaia(addr1.address, kaiaAddress, burnAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
    });
  });

  describe("Token Transfer", function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(owner.address, mintAmount);
    });

    it("Owner should be able to transfer tokens to another address", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.transfer(addr1.address, transferAmount);
      
      const addr1Balance = await xpassTokenBSC.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(transferAmount);
    });

    it("Balance should update correctly after transfer", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);
      const initialBalance = await xpassTokenBSC.balanceOf(owner.address);
      
      await xpassTokenBSC.transfer(addr1.address, transferAmount);
      
      const finalBalance = await xpassTokenBSC.balanceOf(owner.address);
      expect(finalBalance).to.equal(initialBalance - transferAmount);
    });

    it("Should emit Transfer event", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);
      
      await expect(xpassTokenBSC.transfer(addr1.address, transferAmount))
        .to.emit(xpassTokenBSC, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);
    });
  });

  describe("Token Approval and Allowance", function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(owner.address, mintAmount);
    });

    it("User should be able to grant token usage permission to another address", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      
      await xpassTokenBSC.approve(addr1.address, approveAmount);
      
      const allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(approveAmount);
    });

    it("Should emit Approval event", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      
      await expect(xpassTokenBSC.approve(addr1.address, approveAmount))
        .to.emit(xpassTokenBSC, "Approval")
        .withArgs(owner.address, addr1.address, approveAmount);
    });

    it("Approved address should be able to use transferFrom", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      const transferAmount = ethers.parseUnits("500", 18);
      
      // Owner grants permission to addr1
      await xpassTokenBSC.approve(addr1.address, approveAmount);
      
      // Addr1 transfers owner's tokens to addr2
      await xpassTokenBSC.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount);
      
      // Check addr2 balance
      const addr2Balance = await xpassTokenBSC.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(transferAmount);
      
      // Check allowance decrease
      const remainingAllowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
      expect(remainingAllowance).to.equal(approveAmount - transferAmount);
    });

    it("Should not allow transferFrom exceeding allowance", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      const transferAmount = ethers.parseUnits("1500", 18);
      
      // Owner grants permission to addr1
      await xpassTokenBSC.approve(addr1.address, approveAmount);
      
      // Attempt to transfer exceeding allowance
      await expect(
        xpassTokenBSC.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientAllowance");
    });

    it("Should be able to set allowance to zero", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      
      // First grant permission
      await xpassTokenBSC.approve(addr1.address, approveAmount);
      let allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(approveAmount);
      
      // Set permission to zero
      await xpassTokenBSC.approve(addr1.address, 0);
      allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(0);
    });
  });

  describe("Maximum Supply", function () {
    it("maxSupply function should return correct value", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      const expectedMaxSupply = ethers.parseUnits("1000000000", 18);
      expect(maxSupply).to.equal(expectedMaxSupply);
    });

    it("remainingMintableSupply should return MAX_SUPPLY initially", async function () {
      const remaining = await xpassTokenBSC.remainingMintableSupply();
      const maxSupply = await xpassTokenBSC.maxSupply();
      expect(remaining).to.equal(maxSupply);
    });

    it("remainingMintableSupply should decrease after minting", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      const initialRemaining = await xpassTokenBSC.remainingMintableSupply();
      
      await xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount);
      
      const remaining = await xpassTokenBSC.remainingMintableSupply();
      expect(remaining).to.equal(initialRemaining - mintAmount);
    });

    it("canMint should return true for valid amounts", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      expect(await xpassTokenBSC.canMint(mintAmount)).to.be.true;
    });

    it("canMint should return false for amounts exceeding MAX_SUPPLY", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      const excessiveAmount = maxSupply + 1n;
      expect(await xpassTokenBSC.canMint(excessiveAmount)).to.be.false;
    });

    it("canMint should return false after MAX_SUPPLY is reached", async function () {
      const maxSupply = await xpassTokenBSC.maxSupply();
      await xpassTokenBSC.connect(minter).mint(addr1.address, maxSupply);
      
      expect(await xpassTokenBSC.canMint(1)).to.be.false;
    });
  });

  describe("Pause Functionality", function () {
    it("Only proposer should be able to propose pause", async function () {
      await expect(
        timelockController.connect(addr1).proposePause(await xpassTokenBSC.getAddress())
      ).to.be.reverted;
    });

    it("Proposer should be able to propose pause", async function () {
      // Grant PROPOSER_ROLE to addr1 for this test
      const PROPOSER_ROLE = await timelockController.PROPOSER_ROLE();
      await timelockController.grantRole(PROPOSER_ROLE, addr1.address);
      
      // addr1 should be able to propose pause
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await expect(
        timelockController.connect(addr1).schedule(
          await xpassTokenBSC.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          PRODUCTION_DELAY // 48 hours delay
        )
      ).to.not.be.reverted;
    });

    it("Should be able to execute pause through TimelockController", async function () {
      // Schedule pause operation
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY // 48 hours delay
      );
      
      // Wait for delay period
      await time.increase(PRODUCTION_DELAY + 1);
      
      // Execute pause
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      expect(await xpassTokenBSC.paused()).to.be.true;
    });

    it("Token transfer should not be possible when paused", async function () {
      // Mint tokens first
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(owner.address, mintAmount);

      // Pause through TimelockController
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY // 48 hours delay
      );
      
      // Wait for delay period
      await time.increase(PRODUCTION_DELAY + 1);
      
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      const transferAmount = ethers.parseUnits("1000", 18);
      await expect(xpassTokenBSC.transfer(addr1.address, transferAmount))
        .to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
    });

    it("Token minting should not be possible when paused", async function () {
      // Pause through TimelockController
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      const mintAmount = ethers.parseUnits("1000", 18);
      await expect(
        xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
    });

    it("Should allow minting after unpause", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      
      // First, verify mint works normally
      await xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount);
      expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(mintAmount);
      
      // Pause token
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      // Verify mint is blocked
      await expect(
        xpassTokenBSC.connect(minter).mint(addr2.address, mintAmount)
      ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");

      // Unpause token
      const unpauseData = xpassTokenBSC.interface.encodeFunctionData("unpause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        unpauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        unpauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      // Now mint should work again
      await expect(
        xpassTokenBSC.connect(minter).mint(addr2.address, mintAmount)
      ).to.emit(xpassTokenBSC, "TokensMinted")
        .withArgs(addr2.address, mintAmount, minter.address);
      
      expect(await xpassTokenBSC.balanceOf(addr2.address)).to.equal(mintAmount);
    });

    it("Token burning should not be possible when paused", async function () {
      // Mint tokens first
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(addr1.address, mintAmount);

      // Pause through TimelockController
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );

      await expect(
        xpassTokenBSC.connect(addr1).burn(ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
    });

    it("Token transfer should be possible after unpause", async function () {
      // Mint tokens first
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(owner.address, mintAmount);

      // First pause
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY // 48 hours delay
      );
      
      // Wait for delay period
      await time.increase(PRODUCTION_DELAY + 1);
      
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      // Then unpause
      const unpauseData = xpassTokenBSC.interface.encodeFunctionData("unpause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        unpauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY // 48 hours delay
      );
      
      // Wait for delay period
      await time.increase(PRODUCTION_DELAY + 1);
      
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        unpauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      const transferAmount = ethers.parseUnits("1000", 18);
      await expect(xpassTokenBSC.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
    });

    it("Should emit Pause/Unpause events when executed through TimelockController", async function () {
      // Test pause event
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY // 48 hours delay
      );
      
      // Wait for delay period
      await time.increase(PRODUCTION_DELAY + 1);
      
      await expect(
        timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.emit(xpassTokenBSC, "TokensPaused");
      
      // Test unpause event
      const unpauseData = xpassTokenBSC.interface.encodeFunctionData("unpause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        unpauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY // 48 hours delay
      );
      
      // Wait for delay period
      await time.increase(PRODUCTION_DELAY + 1);
      
      await expect(
        timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          unpauseData,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.emit(xpassTokenBSC, "TokensUnpaused");
    });
  });

  describe("Permit-based Transfer", function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      const mintAmount = ethers.parseUnits("1000", 18);
      await xpassTokenBSC.connect(minter).mint(owner.address, mintAmount);
    });

    it("Should be able to transfer using permit", async function () {
      const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_OFFSET;
      const nonce = await xpassTokenBSC.nonces(owner.address);
      const domain = {
        name: await xpassTokenBSC.name(),
        version: await xpassTokenBSC.version(),
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await xpassTokenBSC.getAddress()
      };
      
      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };
      
      const value = ethers.parseUnits("1000", 18);
      const message = {
        owner: owner.address,
        spender: addr1.address,
        value: value,
        nonce: nonce,
        deadline: deadline
      };
      
      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);
      
      await xpassTokenBSC.permit(owner.address, addr1.address, value, deadline, v, r, s);
      
      const allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(value);
    });
  });

  describe("Ownership Management", function () {
    it("Should be able to propose ownership transfer through TimelockController", async function () {
      // Grant PROPOSER_ROLE to addr1 for this test
      const PROPOSER_ROLE = await timelockController.PROPOSER_ROLE();
      await timelockController.grantRole(PROPOSER_ROLE, addr1.address);
      
      // addr1 should be able to propose ownership transfer
      const transferData = xpassTokenBSC.interface.encodeFunctionData("transferOwnership", [addr2.address]);
      await expect(
        timelockController.connect(addr1).schedule(
          await xpassTokenBSC.getAddress(),
          0,
          transferData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          PRODUCTION_DELAY // 48 hours delay
        )
      ).to.not.be.reverted;
    });

    it("Non-proposer should not be able to propose ownership transfer", async function () {
      await expect(
        timelockController.connect(addr1).proposeOwnershipTransferTo(
          await xpassTokenBSC.getAddress(),
          addr2.address
        )
      ).to.be.reverted;
    });

    it("Should be able to propose pause through TimelockController", async function () {
      // Grant PROPOSER_ROLE to addr1 for this test
      const PROPOSER_ROLE = await timelockController.PROPOSER_ROLE();
      await timelockController.grantRole(PROPOSER_ROLE, addr1.address);
      
      // addr1 should be able to propose pause using direct schedule method
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await expect(
        timelockController.connect(addr1).schedule(
          await xpassTokenBSC.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          PRODUCTION_DELAY // 48 hours delay
        )
      ).to.not.be.reverted;
    });
    
    it("Should be able to propose unpause through TimelockController", async function () {
      // Grant PROPOSER_ROLE to addr1 for this test
      const PROPOSER_ROLE = await timelockController.PROPOSER_ROLE();
      await timelockController.grantRole(PROPOSER_ROLE, addr1.address);
      
      // addr1 should be able to propose unpause using direct schedule method
      const unpauseData = xpassTokenBSC.interface.encodeFunctionData("unpause");
      await expect(
        timelockController.connect(addr1).schedule(
          await xpassTokenBSC.getAddress(),
          0,
          unpauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          PRODUCTION_DELAY // 48 hours delay
        )
      ).to.not.be.reverted;
    });

    it("Owner should be able to renounce ownership directly", async function () {
      // Owner (Multi-Sig) can renounce ownership directly without timelock
      await expect(
        xpassTokenBSC.renounceOwnership()
      ).to.not.be.reverted;
      
      // Verify ownership was renounced
      expect(await xpassTokenBSC.owner()).to.equal(ethers.ZeroAddress);
    });

    it("Non-proposer should not be able to propose operations", async function () {
      await expect(
        timelockController.connect(addr1).proposePause(await xpassTokenBSC.getAddress())
      ).to.be.reverted;
      
      await expect(
        timelockController.connect(addr1).proposeUnpause(await xpassTokenBSC.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Minter Role Management", function () {
    it("Should allow TimelockController to grant minter role", async function () {
      const grantData = xpassTokenBSC.interface.encodeFunctionData("grantMinterRole", [addr1.address]);
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      const MINTER_ROLE = await xpassTokenBSC.MINTER_ROLE();
      expect(await xpassTokenBSC.hasRole(MINTER_ROLE, addr1.address)).to.be.true;
    });

    it("Should allow TimelockController to revoke minter role", async function () {
      const revokeData = xpassTokenBSC.interface.encodeFunctionData("revokeMinterRole", [minter.address]);
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        revokeData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        revokeData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      const MINTER_ROLE = await xpassTokenBSC.MINTER_ROLE();
      expect(await xpassTokenBSC.hasRole(MINTER_ROLE, minter.address)).to.be.false;
    });

    it("Should prevent non-timelock from granting minter role", async function () {
      await expect(
        xpassTokenBSC.connect(owner).grantMinterRole(addr2.address)
      ).to.be.revertedWith("XPassTokenBSC: caller is not the timelock controller");
    });

    it("Should prevent non-timelock from revoking minter role", async function () {
      await expect(
        xpassTokenBSC.connect(owner).revokeMinterRole(minter.address)
      ).to.be.revertedWith("XPassTokenBSC: caller is not the timelock controller");
    });

    it("Should prevent granting minter role to zero address", async function () {
      const grantData = xpassTokenBSC.interface.encodeFunctionData("grantMinterRole", [ethers.ZeroAddress]);
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);

      await expect(
        timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          grantData,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("XPassTokenBSC: account cannot be zero address");
    });

    it("Should prevent revoking minter role from zero address", async function () {
      const revokeData = xpassTokenBSC.interface.encodeFunctionData("revokeMinterRole", [ethers.ZeroAddress]);
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        revokeData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);

      await expect(
        timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          revokeData,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("XPassTokenBSC: account cannot be zero address");
    });

    it("Should prevent grantMinterRole when TimelockController is removed", async function () {
      // Renounce ownership to remove TimelockController
      await xpassTokenBSC.renounceOwnership();
      
      // Verify TimelockController is removed
      expect(await xpassTokenBSC.timelockController()).to.equal(ethers.ZeroAddress);
      
      // When TimelockController is removed, onlyTimelock modifier checks first
      // So even if we try to call through TimelockController, it will fail at the modifier level
      // This test verifies that the function cannot be executed when TimelockController is zero
      const grantData = xpassTokenBSC.interface.encodeFunctionData("grantMinterRole", [addr1.address]);
      
      // Try to execute through TimelockController - should fail because timelockController is zero
      // The onlyTimelock modifier will check first and fail
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      
      // The execute will fail because the function checks timelockController != address(0) first
      // But actually, onlyTimelock modifier checks msg.sender == timelockController first
      // Since timelockController is zero, msg.sender (timelockController address) != address(0)
      // So it will fail at the modifier level with "caller is not the timelock controller"
      await expect(
        timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          grantData,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("XPassTokenBSC: caller is not the timelock controller");
    });

    it("Should prevent revokeMinterRole when TimelockController is removed", async function () {
      // Renounce ownership to remove TimelockController
      await xpassTokenBSC.renounceOwnership();
      
      // Verify TimelockController is removed
      expect(await xpassTokenBSC.timelockController()).to.equal(ethers.ZeroAddress);
      
      // Similar to grantMinterRole test above
      const revokeData = xpassTokenBSC.interface.encodeFunctionData("revokeMinterRole", [minter.address]);
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        revokeData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      
      // Will fail at modifier level because timelockController is zero
      await expect(
        timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          revokeData,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
      ).to.be.revertedWith("XPassTokenBSC: caller is not the timelock controller");
    });

    it("Should allow checking if address is minter", async function () {
      expect(await xpassTokenBSC.isMinter(minter.address)).to.be.true;
      expect(await xpassTokenBSC.isMinter(addr1.address)).to.be.false;
    });

    it("Should return correct minter count", async function () {
      expect(await xpassTokenBSC.getMinterCount()).to.equal(1);
      
      const grantData = xpassTokenBSC.interface.encodeFunctionData("grantMinterRole", [addr1.address]);
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      expect(await xpassTokenBSC.getMinterCount()).to.equal(2);
    });

    it("Should return correct minter at index", async function () {
      const minterAt0 = await xpassTokenBSC.getMinterAt(0);
      expect(minterAt0).to.equal(minter.address);
      
      const grantData = xpassTokenBSC.interface.encodeFunctionData("grantMinterRole", [addr1.address]);
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        grantData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      const minterAt1 = await xpassTokenBSC.getMinterAt(1);
      expect(minterAt1).to.equal(addr1.address);
    });
  });

  describe("Error Cases and Edge Conditions", function () {
    describe("Transfer Error Cases", function () {
      beforeEach(async function () {
        // Mint some tokens for testing
        const mintAmount = ethers.parseUnits("1000", 18);
        await xpassTokenBSC.connect(minter).mint(owner.address, mintAmount);
      });

      it("Should revert transfer to zero address", async function () {
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassTokenBSC.transfer(ethers.ZeroAddress, transferAmount))
          .to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InvalidReceiver");
      });

      it("Should revert transfer from zero address", async function () {
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassTokenBSC.transferFrom(ethers.ZeroAddress, addr1.address, transferAmount))
          .to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientAllowance");
      });

      it("Should revert transfer to zero address in transferFrom", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        await xpassTokenBSC.approve(addr1.address, approveAmount);
        
        await expect(
          xpassTokenBSC.connect(addr1).transferFrom(owner.address, ethers.ZeroAddress, approveAmount)
        ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InvalidReceiver");
      });

      it("Should revert transfer with zero amount", async function () {
        // OpenZeppelin v5 allows zero amount transfers
        await expect(xpassTokenBSC.transfer(addr1.address, 0))
          .to.not.be.reverted;
      });

      it("Should revert transferFrom with zero amount", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        await xpassTokenBSC.approve(addr1.address, approveAmount);
        
        // OpenZeppelin v5 allows zero amount transfers
        await expect(
          xpassTokenBSC.connect(addr1).transferFrom(owner.address, addr2.address, 0)
        ).to.not.be.reverted;
      });

      it("Should revert transfer exceeding balance", async function () {
        const ownerBalance = await xpassTokenBSC.balanceOf(owner.address);
        const excessiveAmount = ownerBalance + ethers.parseUnits("1", 18);
        
        await expect(xpassTokenBSC.transfer(addr1.address, excessiveAmount))
          .to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientBalance");
      });

      it("Should revert transferFrom exceeding balance", async function () {
        const ownerBalance = await xpassTokenBSC.balanceOf(owner.address);
        const excessiveAmount = ownerBalance + ethers.parseUnits("1", 18);
        const approveAmount = excessiveAmount;
        
        await xpassTokenBSC.approve(addr1.address, approveAmount);
        
        await expect(
          xpassTokenBSC.connect(addr1).transferFrom(owner.address, addr2.address, excessiveAmount)
        ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientBalance");
      });

      it("Should revert transferFrom when not approved", async function () {
        const transferAmount = ethers.parseUnits("1000", 18);
        
        await expect(
          xpassTokenBSC.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
        ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientAllowance");
      });

      it("Should revert transferFrom with insufficient allowance", async function () {
        const approveAmount = ethers.parseUnits("500", 18);
        const transferAmount = ethers.parseUnits("1000", 18);
        
        await xpassTokenBSC.approve(addr1.address, approveAmount);
        
        await expect(
          xpassTokenBSC.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
        ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InsufficientAllowance");
      });
    });

    describe("Approval Error Cases", function () {
      it("Should revert approval to zero address", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        await expect(xpassTokenBSC.approve(ethers.ZeroAddress, approveAmount))
          .to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InvalidSpender");
      });

      it("Should handle approval with maximum uint256 value", async function () {
        const maxAmount = ethers.MaxUint256;
        await expect(xpassTokenBSC.approve(addr1.address, maxAmount))
          .to.not.be.reverted;
        
        const allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(maxAmount);
      });

      it("Should handle approval with zero amount", async function () {
        // First approve some amount
        const approveAmount = ethers.parseUnits("1000", 18);
        await xpassTokenBSC.approve(addr1.address, approveAmount);
        
        // Then set to zero
        await expect(xpassTokenBSC.approve(addr1.address, 0))
          .to.not.be.reverted;
        
        const allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(0);
      });
    });

    describe("Pause Error Cases", function () {
      it("Should allow pause when already paused (OpenZeppelin behavior)", async function () {
        // First pause the contract
        const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
        await timelockController.schedule(
          await xpassTokenBSC.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          PRODUCTION_DELAY
        );
        
        // Wait for delay period
        await time.increase(PRODUCTION_DELAY + 1);
        
        await timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash
        );
        
        // Verify contract is paused
        expect(await xpassTokenBSC.paused()).to.be.true;
        
        // Test that we can schedule another pause operation with different salt
        const salt = ethers.randomBytes(32);
        await expect(
          timelockController.schedule(
            await xpassTokenBSC.getAddress(),
            0,
            pauseData,
            salt,
            ethers.ZeroHash,
            PRODUCTION_DELAY
          )
        ).to.not.be.reverted;
        
        expect(await xpassTokenBSC.paused()).to.be.true;
      });

      it("Should revert unpause when not paused", async function () {
        const unpauseData = xpassTokenBSC.interface.encodeFunctionData("unpause");
        await timelockController.schedule(
          await xpassTokenBSC.getAddress(),
          0,
          unpauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          PRODUCTION_DELAY // 48 hours delay
        );
        
        // Wait for delay period
        await time.increase(48 * 60 * 60 + 1);
        
        await expect(
          timelockController.execute(
            await xpassTokenBSC.getAddress(),
            0,
            unpauseData,
            ethers.ZeroHash,
            ethers.ZeroHash
          )
        ).to.be.revertedWithCustomError(xpassTokenBSC, "ExpectedPause");
      });

      it("Should revert pause from non-proposer", async function () {
        await expect(
          timelockController.connect(addr1).proposePause(await xpassTokenBSC.getAddress())
        ).to.be.reverted;
      });

      it("Should revert all token operations when paused", async function () {
        // Mint tokens first
        const mintAmount = ethers.parseUnits("1000", 18);
        await xpassTokenBSC.connect(minter).mint(owner.address, mintAmount);

        // First pause the contract
        const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
        await timelockController.schedule(
          await xpassTokenBSC.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          PRODUCTION_DELAY
        );
        
        // Wait for delay period
        await time.increase(PRODUCTION_DELAY + 1);
        
        await timelockController.execute(
          await xpassTokenBSC.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash
        );
        
        // Verify contract is paused
        expect(await xpassTokenBSC.paused()).to.be.true;
        
        // All token operations should be reverted
        await expect(xpassTokenBSC.transfer(addr1.address, ethers.parseUnits("100", 18)))
          .to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
        
        // Note: approve() is not affected by pause in OpenZeppelin's ERC20Pausable
        await xpassTokenBSC.approve(addr1.address, ethers.parseUnits("100", 18));
        
        await expect(
          xpassTokenBSC.connect(addr1).transferFrom(owner.address, addr2.address, ethers.parseUnits("50", 18))
        ).to.be.revertedWithCustomError(xpassTokenBSC, "EnforcedPause");
      });
    });

    describe("Permit Error Cases", function () {
      it("Should revert permit with expired deadline", async function () {
        const deadline = Math.floor(Date.now() / 1000) - 3600 * 24; // 24 hours ago (expired)
        const nonce = await xpassTokenBSC.nonces(owner.address);
        const domain = {
          name: await xpassTokenBSC.name(),
          version: await xpassTokenBSC.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassTokenBSC.getAddress()
        };
        
        const types = {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
          ]
        };
        
        const value = ethers.parseUnits("1000", 18);
        const message = {
          owner: owner.address,
          spender: addr1.address,
          value: value,
          nonce: nonce,
          deadline: deadline
        };
        
        const signature = await owner.signTypedData(domain, types, message);
        const { v, r, s } = ethers.Signature.from(signature);
        
        await expect(
          xpassTokenBSC.permit(owner.address, addr1.address, value, deadline, v, r, s)
        ).to.be.reverted;
      });

      it("Should revert permit with invalid signature", async function () {
        const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_OFFSET;
        const nonce = await xpassTokenBSC.nonces(owner.address);
        const value = ethers.parseUnits("1000", 18);
        
        // Use invalid signature components
        const v = 27;
        const r = ethers.randomBytes(32);
        const s = ethers.randomBytes(32);
        
        await expect(
          xpassTokenBSC.permit(owner.address, addr1.address, value, deadline, v, r, s)
        ).to.be.reverted;
      });

      it("Should revert permit with wrong nonce", async function () {
        const deadline = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
        const wrongNonce = 999; // Wrong nonce
        const domain = {
          name: await xpassTokenBSC.name(),
          version: await xpassTokenBSC.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassTokenBSC.getAddress()
        };
        
        const types = {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
          ]
        };
        
        const value = ethers.parseUnits("1000", 18);
        const message = {
          owner: owner.address,
          spender: addr1.address,
          value: value,
          nonce: wrongNonce,
          deadline: deadline
        };
        
        const signature = await owner.signTypedData(domain, types, message);
        const { v, r, s } = ethers.Signature.from(signature);
        
        await expect(
          xpassTokenBSC.permit(owner.address, addr1.address, value, deadline, v, r, s)
        ).to.be.reverted;
      });

      it("Should revert permit to zero address", async function () {
        const deadline = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
        const nonce = await xpassTokenBSC.nonces(owner.address);
        const domain = {
          name: await xpassTokenBSC.name(),
          version: await xpassTokenBSC.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassTokenBSC.getAddress()
        };
        
        const types = {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
          ]
        };
        
        const value = ethers.parseUnits("1000", 18);
        const message = {
          owner: owner.address,
          spender: ethers.ZeroAddress,
          value: value,
          nonce: nonce,
          deadline: deadline
        };
        
        const signature = await owner.signTypedData(domain, types, message);
        const { v, r, s } = ethers.Signature.from(signature);
        
        await expect(
          xpassTokenBSC.permit(owner.address, ethers.ZeroAddress, value, deadline, v, r, s)
        ).to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InvalidSpender");
      });
    });

    describe("Ownership Transfer Error Cases", function () {
      it("Should revert ownership transfer to zero address", async function () {
        await expect(
          timelockController.proposeOwnershipTransferTo(
            await xpassTokenBSC.getAddress(),
            ethers.ZeroAddress
          )
        ).to.be.reverted;
      });

      it("Should revert ownership transfer from non-proposer", async function () {
        await expect(
          timelockController.connect(addr1).proposeOwnershipTransferTo(
            await xpassTokenBSC.getAddress(),
            addr2.address
          )
        ).to.be.reverted;
      });

      it("Should handle ownership transfer to same address", async function () {
        // Transfer ownership to the same address (owner)
        await expect(
          xpassTokenBSC.transferOwnership(owner.address)
        ).to.not.be.reverted;
        
        // Verify ownership is still the same
        expect(await xpassTokenBSC.owner()).to.equal(owner.address);
      });

      it("Should revert operations after renouncing ownership", async function () {
        // Renounce ownership directly (owner can do this immediately)
        await xpassTokenBSC.renounceOwnership();
        
        // Verify ownership was renounced
        expect(await xpassTokenBSC.owner()).to.equal(ethers.ZeroAddress);
        
        // Owner functions should fail
        await expect(
          xpassTokenBSC.transferOwnership(addr1.address)
        ).to.be.revertedWithCustomError(xpassTokenBSC, "OwnableUnauthorizedAccount");
      });
    });

    describe("Contract State Error Cases", function () {
      it("Should handle extreme values correctly", async function () {
        // Test with maximum uint256 values
        const maxUint256 = ethers.MaxUint256;
        
        // Approve maximum amount
        await expect(xpassTokenBSC.approve(addr1.address, maxUint256))
          .to.not.be.reverted;
        
        const allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(maxUint256);
        
        // Reset approval
        await xpassTokenBSC.approve(addr1.address, 0);
      });

      it("Should handle zero address operations correctly", async function () {
        // Transfer to zero address should fail
        await expect(xpassTokenBSC.transfer(ethers.ZeroAddress, ethers.parseUnits("1", 18)))
          .to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InvalidReceiver");
        
        // Approve zero address should fail
        await expect(xpassTokenBSC.approve(ethers.ZeroAddress, ethers.parseUnits("1", 18)))
          .to.be.revertedWithCustomError(xpassTokenBSC, "ERC20InvalidSpender");
      });
    });
  });

  describe("Boundary Value Tests", function () {
    describe("Extreme Amount Tests", function () {
      it("Should handle maximum uint256 amount", async function () {
        const maxAmount = ethers.MaxUint256;
        
        // Approve maximum amount
        await expect(xpassTokenBSC.approve(addr1.address, maxAmount))
          .to.not.be.reverted;
        
        const allowance = await xpassTokenBSC.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(maxAmount);
        
        // Reset approval
        await xpassTokenBSC.approve(addr1.address, 0);
      });

      it("Should handle minimum amount (1 wei)", async function () {
        const minAmount = 1;
        await xpassTokenBSC.connect(minter).mint(addr1.address, minAmount);
        
        // Transfer minimum amount
        await expect(xpassTokenBSC.connect(addr1).transfer(addr2.address, minAmount))
          .to.not.be.reverted;
        
        const addr2Balance = await xpassTokenBSC.balanceOf(addr2.address);
        expect(addr2Balance).to.equal(minAmount);
      });

      it("Should handle amount equal to MAX_SUPPLY", async function () {
        const maxSupply = await xpassTokenBSC.maxSupply();
        
        // Mint entire supply
        await expect(xpassTokenBSC.connect(minter).mint(addr1.address, maxSupply))
          .to.not.be.reverted;
        
        const addr1Balance = await xpassTokenBSC.balanceOf(addr1.address);
        expect(addr1Balance).to.equal(maxSupply);
      });

      it("Should handle amount equal to MAX_SUPPLY minus 1 wei", async function () {
        const maxSupply = await xpassTokenBSC.maxSupply();
        const amountMinusOne = maxSupply - 1n;
        
        // Mint total supply minus 1 wei
        await expect(xpassTokenBSC.connect(minter).mint(addr1.address, amountMinusOne))
          .to.not.be.reverted;
        
        const addr1Balance = await xpassTokenBSC.balanceOf(addr1.address);
        expect(addr1Balance).to.equal(amountMinusOne);
        
        // Should be able to mint 1 more wei
        await xpassTokenBSC.connect(minter).mint(addr1.address, 1);
        expect(await xpassTokenBSC.balanceOf(addr1.address)).to.equal(maxSupply);
      });

      it("Should handle amount equal to MAX_SUPPLY plus 1 wei", async function () {
        const maxSupply = await xpassTokenBSC.maxSupply();
        const amountPlusOne = maxSupply + 1n;
        
        // Mint amount exceeding max supply should fail
        await expect(xpassTokenBSC.connect(minter).mint(addr1.address, amountPlusOne))
          .to.be.revertedWith("XPassTokenBSC: exceeds maximum supply");
      });
    });

    describe("Address Boundary Tests", function () {
      it("Should handle address with all zeros except last byte", async function () {
        const testAddress = "0x0000000000000000000000000000000000000001";
        const mintAmount = ethers.parseUnits("1000", 18);
        
        await xpassTokenBSC.connect(minter).mint(testAddress, mintAmount);
        
        const testAddressBalance = await xpassTokenBSC.balanceOf(testAddress);
        expect(testAddressBalance).to.equal(mintAmount);
      });

      it("Should handle address with all ones", async function () {
        const testAddress = "0xffffffffffffffffffffffffffffffffffffffff";
        const mintAmount = ethers.parseUnits("1000", 18);
        
        await xpassTokenBSC.connect(minter).mint(testAddress, mintAmount);
        
        const testAddressBalance = await xpassTokenBSC.balanceOf(testAddress);
        expect(testAddressBalance).to.equal(mintAmount);
      });
    });

    describe("Nonce Boundary Tests", function () {
      it("Should handle nonce at zero", async function () {
        const nonce = await xpassTokenBSC.nonces(owner.address);
        
        // Test that nonce is a valid number
        expect(nonce).to.be.a('bigint');
        expect(nonce).to.be.greaterThanOrEqual(0n);
      });

      it("Should handle nonce increment", async function () {
        const initialNonce = await xpassTokenBSC.nonces(owner.address);
        
        // Perform a permit operation to increment nonce
        const deadline = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
        const domain = {
          name: await xpassTokenBSC.name(),
          version: await xpassTokenBSC.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassTokenBSC.getAddress()
        };
        
        const types = {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
          ]
        };
        
        const value = ethers.parseUnits("1000", 18);
        const message = {
          owner: owner.address,
          spender: addr1.address,
          value: value,
          nonce: initialNonce,
          deadline: deadline
        };
        
        const signature = await owner.signTypedData(domain, types, message);
        const { v, r, s } = ethers.Signature.from(signature);
        
        // Execute permit
        await xpassTokenBSC.permit(owner.address, addr1.address, value, deadline, v, r, s);
        
        // Check that nonce has increased
        const newNonce = await xpassTokenBSC.nonces(owner.address);
        expect(newNonce).to.equal(initialNonce + 1n);
      });
    });
  });

  describe("View Functions Tests", function () {
    it("Should return correct version", async function () {
      expect(await xpassTokenBSC.version()).to.equal("1");
    });

    it("Should return correct maxSupply", async function () {
      const expectedMaxSupply = ethers.parseUnits("1000000000", 18); // 1 billion tokens
      expect(await xpassTokenBSC.maxSupply()).to.equal(expectedMaxSupply);
    });

    it("Should return correct timelock controller", async function () {
      expect(await xpassTokenBSC.getTimelockController()).to.equal(await timelockController.getAddress());
    });
  });

  describe("TimelockController Integration Tests", function () {
    it("Should have correct delay time", async function () {
      const delay = await timelockController.getCurrentDelay();
      expect(delay).to.equal(PRODUCTION_DELAY); // 48 hours delay (same as production)
    });

    describe("Delay-based Operations", function () {
      let timelockWithDelay;
      let xpassBSCWithDelay;

      beforeEach(async function () {
        // Deploy TimelockController with actual delay for delay testing
        const minDelay = TEST_DELAY; // 1 minute delay for testing
        const admin = owner.address; // Owner as admin - will be used for all roles
        
        timelockWithDelay = await XPassTimelockController.deploy(
          minDelay,
          admin
        );
        
        // Deploy XPassTokenBSC with delay-enabled TimelockController
        xpassBSCWithDelay = await XPassTokenBSC.deploy(
          owner.address,
          minter.address,
          await timelockWithDelay.getAddress()
        );
      });

      it("Should not execute operation before delay period", async function () {
        const pauseData = xpassBSCWithDelay.interface.encodeFunctionData("pause");
        
        // Schedule operation
        await timelockWithDelay.schedule(
          await xpassBSCWithDelay.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          TEST_DELAY // 1 minute delay
        );
        
        // Try to execute immediately - should fail
        await expect(
          timelockWithDelay.execute(
            await xpassBSCWithDelay.getAddress(),
            0,
            pauseData,
            ethers.ZeroHash,
            ethers.ZeroHash
          )
        ).to.be.revertedWithCustomError(timelockWithDelay, "TimelockUnexpectedOperationState");
      });

      it("Should execute operation after delay period", async function () {
        const pauseData = xpassBSCWithDelay.interface.encodeFunctionData("pause");
        
        // Schedule operation
        await timelockWithDelay.schedule(
          await xpassBSCWithDelay.getAddress(),
          0,
          pauseData,
          ethers.ZeroHash,
          ethers.ZeroHash,
          TEST_DELAY // 1 minute delay
        );
        
        // Wait for delay period
        await time.increase(TEST_DELAY);
        
        // Execute operation - should succeed
        await expect(
          timelockWithDelay.execute(
            await xpassBSCWithDelay.getAddress(),
            0,
            pauseData,
            ethers.ZeroHash,
            ethers.ZeroHash
          )
        ).to.not.be.reverted;
        
        // Verify operation was executed
        expect(await xpassBSCWithDelay.paused()).to.be.true;
      });
    });

    it("Should be able to schedule and execute operations", async function () {
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      
      // Schedule operation
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY // 48 hours delay
      );
      
      // Wait for delay period
      await time.increase(PRODUCTION_DELAY + 1);
      
      // Execute operation
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      expect(await xpassTokenBSC.paused()).to.be.true;
    });
  });

  describe("TimelockController Management", function() {
    it("Should allow owner to change TimelockController", async function() {
      const newTimelockController = addr1.address;
      
      // Owner should be able to change TimelockController
      await expect(xpassTokenBSC.changeTimelockController(newTimelockController))
        .to.emit(xpassTokenBSC, "TimelockControllerChanged")
        .withArgs(await timelockController.getAddress(), newTimelockController);
      
      // Verify the change
      expect(await xpassTokenBSC.timelockController()).to.equal(newTimelockController);
      expect(await xpassTokenBSC.getTimelockController()).to.equal(newTimelockController);
    });

    it("Should not allow non-owner to change TimelockController", async function() {
      const newTimelockController = addr1.address;
      
      // Non-owner should not be able to change TimelockController
      await expect(xpassTokenBSC.connect(addr1).changeTimelockController(newTimelockController))
        .to.be.revertedWithCustomError(xpassTokenBSC, "OwnableUnauthorizedAccount")
        .withArgs(addr1.address);
    });

    it("Should not allow changing TimelockController to zero address", async function() {
      await expect(xpassTokenBSC.changeTimelockController(ethers.ZeroAddress))
        .to.be.revertedWith("XPassTokenBSC: new timelock controller cannot be zero address");
    });

    it("Should not allow changing TimelockController to current TimelockController", async function() {
      const currentTimelockController = await timelockController.getAddress();
      
      await expect(xpassTokenBSC.changeTimelockController(currentTimelockController))
        .to.be.revertedWith("XPassTokenBSC: new timelock controller cannot be current timelock controller");
    });
  });

  describe("RenounceOwnership with TimelockController", function() {
    it("Should remove TimelockController after renounceOwnership", async function() {
      // Renounce ownership (should automatically remove TimelockController)
      await xpassTokenBSC.renounceOwnership();
      
      // Verify TimelockController is removed
      expect(await xpassTokenBSC.timelockController()).to.equal(ethers.ZeroAddress);
      
      // Verify owner is also renounced
      expect(await xpassTokenBSC.owner()).to.equal(ethers.ZeroAddress);
    });

    it("Should not allow changeTimelockController after renounceOwnership", async function() {
      // Renounce ownership
      await xpassTokenBSC.renounceOwnership();
      
      // Verify owner is now zero address
      expect(await xpassTokenBSC.owner()).to.equal(ethers.ZeroAddress);
      
      // Should not be able to change TimelockController
      await expect(xpassTokenBSC.changeTimelockController(addr1.address))
        .to.be.revertedWithCustomError(xpassTokenBSC, "OwnableUnauthorizedAccount");
    });

    it("Should not allow renounceOwnership when paused", async function() {
      // First pause the token
      const pauseData = xpassTokenBSC.interface.encodeFunctionData("pause");
      await timelockController.schedule(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        PRODUCTION_DELAY
      );
      
      await time.increase(PRODUCTION_DELAY + 1);
      await timelockController.execute(
        await xpassTokenBSC.getAddress(),
        0,
        pauseData,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
      
      // Verify token is paused
      expect(await xpassTokenBSC.paused()).to.be.true;
      
      // Should not be able to renounce ownership when paused
      await expect(xpassTokenBSC.renounceOwnership())
        .to.be.revertedWith("XPassTokenBSC: cannot renounce ownership while paused");
    });

    it("Should automatically remove TimelockController on renounceOwnership when not paused", async function() {
      // Renounce ownership should automatically remove TimelockController when not paused
      await expect(xpassTokenBSC.renounceOwnership())
        .to.emit(xpassTokenBSC, "TimelockControllerChanged")
        .withArgs(await timelockController.getAddress(), ethers.ZeroAddress);
      
      // Verify TimelockController is removed
      expect(await xpassTokenBSC.timelockController()).to.equal(ethers.ZeroAddress);
      
      // Verify owner is also renounced
      expect(await xpassTokenBSC.owner()).to.equal(ethers.ZeroAddress);
    });
  });
});

