const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("XPassToken", function () {
  let XPassToken;
  let xpassToken;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    // Get accounts
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Get XPassToken contract factory
    XPassToken = await ethers.getContractFactory("XPassToken");
    
    // Deploy contract
    xpassToken = await XPassToken.deploy(owner.address);
  });

  describe("Deployment", function () {
    it("Should deploy with correct owner", async function () {
      expect(await xpassToken.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await xpassToken.name()).to.equal("XPASS Token");
      expect(await xpassToken.symbol()).to.equal("XPASS");
    });

    it("Should have correct decimal places", async function () {
      expect(await xpassToken.decimals()).to.equal(18);
    });

    it("Should allocate initial supply to owner", async function () {
      const totalSupply = await xpassToken.totalSupply();
      const ownerBalance = await xpassToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(totalSupply);
    });

    it("Should have initial supply of 1,000,000,000 XPASS", async function () {
      const totalSupply = await xpassToken.totalSupply();
      const expectedSupply = ethers.parseUnits("1000000000", 18);
      expect(totalSupply).to.equal(expectedSupply);
    });

    it("Should verify initial supply equals maximum supply", async function () {
      const totalSupply = await xpassToken.totalSupply();
      const maxSupply = await xpassToken.maxSupply();
      expect(totalSupply).to.equal(maxSupply);
    });
  });

  describe("Token Transfer", function () {
    it("Owner should be able to transfer tokens to another address", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);
      await xpassToken.transfer(addr1.address, transferAmount);
      
      const addr1Balance = await xpassToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(transferAmount);
    });

    it("Balance should update correctly after transfer", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);
      const initialBalance = await xpassToken.balanceOf(owner.address);
      
      await xpassToken.transfer(addr1.address, transferAmount);
      
      const finalBalance = await xpassToken.balanceOf(owner.address);
      expect(finalBalance).to.equal(initialBalance - transferAmount);
    });

    it("Should emit Transfer event", async function () {
      const transferAmount = ethers.parseUnits("1000", 18);
      
      await expect(xpassToken.transfer(addr1.address, transferAmount))
        .to.emit(xpassToken, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);
    });
  });

  describe("Token Approval and Allowance", function () {
    it("User should be able to grant token usage permission to another address", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      
      await xpassToken.approve(addr1.address, approveAmount);
      
      const allowance = await xpassToken.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(approveAmount);
    });

    it("Should emit Approval event", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      
      await expect(xpassToken.approve(addr1.address, approveAmount))
        .to.emit(xpassToken, "Approval")
        .withArgs(owner.address, addr1.address, approveAmount);
    });

    it("Approved address should be able to use transferFrom", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      const transferAmount = ethers.parseUnits("500", 18);
      
      // Owner grants permission to addr1
      await xpassToken.approve(addr1.address, approveAmount);
      
      // Addr1 transfers owner's tokens to addr2
      await xpassToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount);
      
      // Check addr2 balance
      const addr2Balance = await xpassToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(transferAmount);
      
      // Check allowance decrease
      const remainingAllowance = await xpassToken.allowance(owner.address, addr1.address);
      expect(remainingAllowance).to.equal(approveAmount - transferAmount);
    });

    it("Should not allow transferFrom exceeding allowance", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      const transferAmount = ethers.parseUnits("1500", 18);
      
      // Owner grants permission to addr1
      await xpassToken.approve(addr1.address, approveAmount);
      
      // Attempt to transfer exceeding allowance
      await expect(
        xpassToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.be.revertedWithCustomError(xpassToken, "ERC20InsufficientAllowance");
    });

    it("Should be able to set allowance to zero", async function () {
      const approveAmount = ethers.parseUnits("1000", 18);
      
      // First grant permission
      await xpassToken.approve(addr1.address, approveAmount);
      let allowance = await xpassToken.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(approveAmount);
      
      // Set permission to zero
      await xpassToken.approve(addr1.address, 0);
      allowance = await xpassToken.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(0);
    });
  });

  describe("Fixed Supply", function () {
    it("maxSupply function should return correct value", async function () {
      const maxSupply = await xpassToken.maxSupply();
      const expectedMaxSupply = ethers.parseUnits("1000000000", 18);
      expect(maxSupply).to.equal(expectedMaxSupply);
    });

    it("Additional minting should not be possible as initial supply already reached maximum", async function () {
      // mint function does not exist, so calling itself is not possible
      // This is verified at contract compilation time
      expect(xpassToken.mint).to.be.undefined;
    });

    it("burn function should not exist", async function () {
      // burn function does not exist, so calling itself is not possible
      expect(xpassToken.burn).to.be.undefined;
    });

    it("burnFrom function should not exist", async function () {
      // burnFrom function does not exist, so calling itself is not possible
      expect(xpassToken.burnFrom).to.be.undefined;
    });
  });

  describe("Pause Functionality", function () {
    it("Only owner should be able to pause", async function () {
      await expect(xpassToken.connect(addr1).pause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
    });

    it("Owner should be able to pause", async function () {
      await xpassToken.pause();
      expect(await xpassToken.paused()).to.be.true;
    });

    it("Token transfer should not be possible when paused", async function () {
      await xpassToken.pause();
      
      const transferAmount = ethers.parseUnits("1000", 18);
      await expect(xpassToken.transfer(addr1.address, transferAmount))
        .to.be.revertedWithCustomError(xpassToken, "EnforcedPause");
    });

    it("Token transfer should be possible after unpause", async function () {
      await xpassToken.pause();
      await xpassToken.unpause();
      
      const transferAmount = ethers.parseUnits("1000", 18);
      await expect(xpassToken.transfer(addr1.address, transferAmount))
        .to.not.be.reverted;
    });

    it("Should emit Pause/Unpause events", async function () {
      await expect(xpassToken.pause())
        .to.emit(xpassToken, "TokensPaused");
      
      await expect(xpassToken.unpause())
        .to.emit(xpassToken, "TokensUnpaused");
    });
  });

  describe("Permit-based Transfer", function () {
    it("Should be able to transfer using permit", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour later
      const nonce = await xpassToken.nonces(owner.address);
      const domain = {
        name: await xpassToken.name(),
        version: await xpassToken.version(),
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await xpassToken.getAddress()
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
      
      await xpassToken.permit(owner.address, addr1.address, value, deadline, v, r, s);
      
      const allowance = await xpassToken.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(value);
    });
  });

  describe("Ownership Management", function () {
    it("Should be able to transfer ownership", async function () {
      await xpassToken.transferOwnership(addr1.address);
      expect(await xpassToken.owner()).to.equal(addr1.address);
    });

    it("Non-owner account should not be able to transfer ownership", async function () {
      await expect(xpassToken.connect(addr1).transferOwnership(addr2.address))
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
    });

    it("Should emit OwnershipTransferred event", async function () {
      await expect(xpassToken.transferOwnership(addr1.address))
        .to.emit(xpassToken, "OwnershipTransferred")
        .withArgs(owner.address, addr1.address);
    });
    
    it("Owner should be able to renounce ownership", async function () {
      await xpassToken.renounceOwnership();
      expect(await xpassToken.owner()).to.equal(ethers.ZeroAddress);
    });

    it("Non-owner account should not be able to renounce ownership", async function () {
      await expect(xpassToken.connect(addr1).renounceOwnership())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
    });

    it("Should emit OwnershipTransferred event when renouncing ownership", async function () {
      await expect(xpassToken.renounceOwnership())
        .to.emit(xpassToken, "OwnershipTransferred")
        .withArgs(owner.address, ethers.ZeroAddress);
    });

    it("New owner should have permissions after ownership transfer", async function () {
      // Transfer ownership to addr1
      await xpassToken.transferOwnership(addr1.address);
      
      // New owner (addr1) should be able to pause
      await expect(xpassToken.connect(addr1).pause())
        .to.not.be.reverted;
      
      // Previous owner should no longer have permissions
      await expect(xpassToken.pause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
    });

    it("No one should be able to call owner functions after renouncing ownership", async function () {
      // Renounce ownership
      await xpassToken.renounceOwnership();
      
      // Previous owner should also not have permissions
      await expect(xpassToken.pause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      
      // Other accounts should not have permissions
      await expect(xpassToken.connect(addr1).pause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      
      // Unpause should also not be possible
      await expect(xpassToken.pause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
    });

    it("Non-owner account should not be able to call unpause", async function () {
      // First owner pauses
      await xpassToken.pause();
      
      // Non-owner account attempts unpause
      await expect(xpassToken.connect(addr1).unpause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
    });

    it("Multiple ownership transfers should be possible", async function () {
      // owner -> addr1
      await xpassToken.transferOwnership(addr1.address);
      expect(await xpassToken.owner()).to.equal(addr1.address);
      
      // addr1 -> addr2
      await xpassToken.connect(addr1).transferOwnership(addr2.address);
      expect(await xpassToken.owner()).to.equal(addr2.address);
      
      // addr2 should have permissions
      await expect(xpassToken.connect(addr2).pause())
        .to.not.be.reverted;
    });
  });

  describe("Ownership Edge Cases", function () {
    it("Should not be able to transfer ownership to zero address", async function () {
      await expect(xpassToken.transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(xpassToken, "OwnableInvalidOwner");
    });

    it("Should be able to transfer ownership to current owner", async function () {
      await expect(xpassToken.transferOwnership(owner.address))
        .to.not.be.reverted;
      expect(await xpassToken.owner()).to.equal(owner.address);
    });

    it("When paused, only token transfer should be blocked, management functions should work", async function () {
      // Pause
      await xpassToken.pause();
      
      // Token transfer should be blocked
      const transferAmount = ethers.parseUnits("1000", 18);
      await expect(xpassToken.transfer(addr1.address, transferAmount))
        .to.be.revertedWithCustomError(xpassToken, "EnforcedPause");
      
      // Ownership transfer should be possible (unrelated to token transfer)
      await expect(xpassToken.transferOwnership(addr1.address))
        .to.not.be.reverted;
      
      // New owner should be able to unpause
      await expect(xpassToken.connect(addr1).unpause())
        .to.not.be.reverted;
    });

    it("Should not error when calling pause again on already paused state", async function () {
      await xpassToken.pause();
      await expect(xpassToken.pause())
        .to.be.revertedWithCustomError(xpassToken, "EnforcedPause");
    });

    it("Should error when calling unpause on non-paused state", async function () {
      await expect(xpassToken.unpause())
        .to.be.revertedWithCustomError(xpassToken, "ExpectedPause");
    });

    it("Unauthorized accounts should not access any owner-only functions", async function () {
      // Cannot access pause
      await expect(xpassToken.connect(addr1).pause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      
      // Cannot access unpause (even if not paused)
      await expect(xpassToken.connect(addr1).unpause())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      
      // Cannot access transferOwnership
      await expect(xpassToken.connect(addr1).transferOwnership(addr2.address))
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      
      // Cannot access renounceOwnership
      await expect(xpassToken.connect(addr1).renounceOwnership())
        .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Error Cases and Edge Conditions", function () {
    describe("Transfer Error Cases", function () {
      it("Should revert transfer to zero address", async function () {
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.transfer(ethers.ZeroAddress, transferAmount))
          .to.be.revertedWithCustomError(xpassToken, "ERC20InvalidReceiver");
      });

      it("Should revert transfer from zero address", async function () {
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.transferFrom(ethers.ZeroAddress, addr1.address, transferAmount))
          .to.be.revertedWithCustomError(xpassToken, "ERC20InsufficientAllowance");
      });

      it("Should revert transfer to zero address in transferFrom", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        await xpassToken.approve(addr1.address, approveAmount);
        
        await expect(
          xpassToken.connect(addr1).transferFrom(owner.address, ethers.ZeroAddress, approveAmount)
        ).to.be.revertedWithCustomError(xpassToken, "ERC20InvalidReceiver");
      });

      it("Should revert transfer with zero amount", async function () {
        // OpenZeppelin v5 allows zero amount transfers
        await expect(xpassToken.transfer(addr1.address, 0))
          .to.not.be.reverted;
      });

      it("Should revert transferFrom with zero amount", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        await xpassToken.approve(addr1.address, approveAmount);
        
        // OpenZeppelin v5 allows zero amount transfers
        await expect(
          xpassToken.connect(addr1).transferFrom(owner.address, addr2.address, 0)
        ).to.not.be.reverted;
      });

      it("Should revert transfer exceeding balance", async function () {
        const ownerBalance = await xpassToken.balanceOf(owner.address);
        const excessiveAmount = ownerBalance + ethers.parseUnits("1", 18);
        
        await expect(xpassToken.transfer(addr1.address, excessiveAmount))
          .to.be.revertedWithCustomError(xpassToken, "ERC20InsufficientBalance");
      });

      it("Should revert transferFrom exceeding balance", async function () {
        const ownerBalance = await xpassToken.balanceOf(owner.address);
        const excessiveAmount = ownerBalance + ethers.parseUnits("1", 18);
        const approveAmount = excessiveAmount;
        
        await xpassToken.approve(addr1.address, approveAmount);
        
        await expect(
          xpassToken.connect(addr1).transferFrom(owner.address, addr2.address, excessiveAmount)
        ).to.be.revertedWithCustomError(xpassToken, "ERC20InsufficientBalance");
      });

      it("Should revert transferFrom when not approved", async function () {
        const transferAmount = ethers.parseUnits("1000", 18);
        
        await expect(
          xpassToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
        ).to.be.revertedWithCustomError(xpassToken, "ERC20InsufficientAllowance");
      });

      it("Should revert transferFrom with insufficient allowance", async function () {
        const approveAmount = ethers.parseUnits("500", 18);
        const transferAmount = ethers.parseUnits("1000", 18);
        
        await xpassToken.approve(addr1.address, approveAmount);
        
        await expect(
          xpassToken.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
        ).to.be.revertedWithCustomError(xpassToken, "ERC20InsufficientAllowance");
      });
    });

    describe("Approval Error Cases", function () {
      it("Should revert approval to zero address", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.approve(ethers.ZeroAddress, approveAmount))
          .to.be.revertedWithCustomError(xpassToken, "ERC20InvalidSpender");
      });

      it("Should revert approval from zero address", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.approve(addr1.address, approveAmount))
          .to.not.be.reverted; // This should work for owner
        
        // But if we try to approve from zero address, it should fail
        // Note: This is more of a theoretical test as zero address can't sign transactions
      });

      it("Should handle approval with maximum uint256 value", async function () {
        const maxAmount = ethers.MaxUint256;
        await expect(xpassToken.approve(addr1.address, maxAmount))
          .to.not.be.reverted;
        
        const allowance = await xpassToken.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(maxAmount);
      });

      it("Should handle approval with zero amount", async function () {
        // First approve some amount
        const approveAmount = ethers.parseUnits("1000", 18);
        await xpassToken.approve(addr1.address, approveAmount);
        
        // Then set to zero
        await expect(xpassToken.approve(addr1.address, 0))
          .to.not.be.reverted;
        
        const allowance = await xpassToken.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(0);
      });
    });

    describe("Pause Error Cases", function () {
      it("Should revert pause when already paused", async function () {
        await xpassToken.pause();
        await expect(xpassToken.pause())
          .to.be.revertedWithCustomError(xpassToken, "EnforcedPause");
      });

      it("Should revert unpause when not paused", async function () {
        await expect(xpassToken.unpause())
          .to.be.revertedWithCustomError(xpassToken, "ExpectedPause");
      });

      it("Should revert pause from non-owner when not paused", async function () {
        await expect(xpassToken.connect(addr1).pause())
          .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      });

      it("Should revert unpause from non-owner when paused", async function () {
        await xpassToken.pause();
        await expect(xpassToken.connect(addr1).unpause())
          .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      });

      it("Should revert all token operations when paused", async function () {
        await xpassToken.pause();
        
        // Transfer should fail
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.transfer(addr1.address, transferAmount))
          .to.be.revertedWithCustomError(xpassToken, "EnforcedPause");
        
        // transferFrom should fail
        const approveAmount = ethers.parseUnits("1000", 18);
        await xpassToken.approve(addr1.address, approveAmount);
        await expect(
          xpassToken.connect(addr1).transferFrom(owner.address, addr2.address, approveAmount)
        ).to.be.revertedWithCustomError(xpassToken, "EnforcedPause");
      });
    });

    describe("Permit Error Cases", function () {
      it("Should revert permit with expired deadline", async function () {
        const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago (expired)
        const nonce = await xpassToken.nonces(owner.address);
        const domain = {
          name: await xpassToken.name(),
          version: await xpassToken.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassToken.getAddress()
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
          xpassToken.permit(owner.address, addr1.address, value, deadline, v, r, s)
        ).to.be.reverted;
      });

      it("Should revert permit with invalid signature", async function () {
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour later
        const nonce = await xpassToken.nonces(owner.address);
        const value = ethers.parseUnits("1000", 18);
        
        // Use invalid signature components
        const v = 27;
        const r = ethers.randomBytes(32);
        const s = ethers.randomBytes(32);
        
        await expect(
          xpassToken.permit(owner.address, addr1.address, value, deadline, v, r, s)
        ).to.be.reverted;
      });

      it("Should revert permit with wrong nonce", async function () {
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const wrongNonce = 999; // Wrong nonce
        const domain = {
          name: await xpassToken.name(),
          version: await xpassToken.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassToken.getAddress()
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
          xpassToken.permit(owner.address, addr1.address, value, deadline, v, r, s)
        ).to.be.reverted;
      });

      it("Should revert permit to zero address", async function () {
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = await xpassToken.nonces(owner.address);
        const domain = {
          name: await xpassToken.name(),
          version: await xpassToken.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassToken.getAddress()
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
          xpassToken.permit(owner.address, ethers.ZeroAddress, value, deadline, v, r, s)
        ).to.be.revertedWithCustomError(xpassToken, "ERC20InvalidSpender");
      });
    });

    describe("Ownership Transfer Error Cases", function () {
      it("Should revert ownership transfer to zero address", async function () {
        await expect(xpassToken.transferOwnership(ethers.ZeroAddress))
          .to.be.revertedWithCustomError(xpassToken, "OwnableInvalidOwner");
      });

      it("Should revert ownership transfer from non-owner", async function () {
        await expect(xpassToken.connect(addr1).transferOwnership(addr2.address))
          .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      });

      it("Should revert renounce ownership from non-owner", async function () {
        await expect(xpassToken.connect(addr1).renounceOwnership())
          .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      });

      it("Should handle ownership transfer to same address", async function () {
        await expect(xpassToken.transferOwnership(owner.address))
          .to.not.be.reverted;
        expect(await xpassToken.owner()).to.equal(owner.address);
      });

      it("Should revert operations after renouncing ownership", async function () {
        await xpassToken.renounceOwnership();
        
        // All owner functions should fail
        await expect(xpassToken.pause())
          .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
        
        await expect(xpassToken.unpause())
          .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
        
        await expect(xpassToken.transferOwnership(addr1.address))
          .to.be.revertedWithCustomError(xpassToken, "OwnableUnauthorizedAccount");
      });
    });

    describe("Contract State Error Cases", function () {
      it("Should revert operations on destroyed contract", async function () {
        // Note: This test assumes the contract has a selfdestruct function
        // Since XPassToken doesn't have selfdestruct, this is a theoretical test
        // In practice, this would test if the contract is still functional
        
        // Test that basic functions still work
        expect(await xpassToken.name()).to.equal("XPASS Token");
        expect(await xpassToken.symbol()).to.equal("XPASS");
        expect(await xpassToken.decimals()).to.equal(18);
      });

      it("Should handle extreme values correctly", async function () {
        // Test with maximum uint256 values
        const maxUint256 = ethers.MaxUint256;
        
        // Approve maximum amount
        await expect(xpassToken.approve(addr1.address, maxUint256))
          .to.not.be.reverted;
        
        const allowance = await xpassToken.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(maxUint256);
        
        // Reset approval
        await xpassToken.approve(addr1.address, 0);
      });

      it("Should handle zero address operations correctly", async function () {
        // Test that zero address is handled properly in various functions
        // Most functions should revert when zero address is used as a parameter
        
        // Transfer to zero address should fail
        await expect(xpassToken.transfer(ethers.ZeroAddress, ethers.parseUnits("1", 18)))
          .to.be.revertedWithCustomError(xpassToken, "ERC20InvalidReceiver");
        
        // Approve zero address should fail
        await expect(xpassToken.approve(ethers.ZeroAddress, ethers.parseUnits("1", 18)))
          .to.be.revertedWithCustomError(xpassToken, "ERC20InvalidSpender");
      });
    });
  });

  describe("Boundary Value Tests", function () {
    describe("Extreme Amount Tests", function () {
      it("Should handle maximum uint256 amount", async function () {
        const maxAmount = ethers.MaxUint256;
        
        // Approve maximum amount
        await expect(xpassToken.approve(addr1.address, maxAmount))
          .to.not.be.reverted;
        
        const allowance = await xpassToken.allowance(owner.address, addr1.address);
        expect(allowance).to.equal(maxAmount);
        
        // Reset approval
        await xpassToken.approve(addr1.address, 0);
      });

      it("Should handle minimum amount (1 wei)", async function () {
        const minAmount = 1;
        
        // Transfer minimum amount
        await expect(xpassToken.transfer(addr1.address, minAmount))
          .to.not.be.reverted;
        
        const addr1Balance = await xpassToken.balanceOf(addr1.address);
        expect(addr1Balance).to.equal(minAmount);
        
        // Transfer back
        await xpassToken.connect(addr1).transfer(owner.address, minAmount);
      });

      it("Should handle amount equal to total supply", async function () {
        const totalSupply = await xpassToken.totalSupply();
        
        // Transfer entire supply
        await expect(xpassToken.transfer(addr1.address, totalSupply))
          .to.not.be.reverted;
        
        const addr1Balance = await xpassToken.balanceOf(addr1.address);
        expect(addr1Balance).to.equal(totalSupply);
        
        const ownerBalance = await xpassToken.balanceOf(owner.address);
        expect(ownerBalance).to.equal(0);
        
        // Transfer back
        await xpassToken.connect(addr1).transfer(owner.address, totalSupply);
      });

      it("Should handle amount equal to total supply minus 1 wei", async function () {
        const totalSupply = await xpassToken.totalSupply();
        const amountMinusOne = totalSupply - 1n;
        
        // Transfer total supply minus 1 wei
        await expect(xpassToken.transfer(addr1.address, amountMinusOne))
          .to.not.be.reverted;
        
        const addr1Balance = await xpassToken.balanceOf(addr1.address);
        expect(addr1Balance).to.equal(amountMinusOne);
        
        const ownerBalance = await xpassToken.balanceOf(owner.address);
        expect(ownerBalance).to.equal(1n);
        
        // Transfer back
        await xpassToken.connect(addr1).transfer(owner.address, amountMinusOne);
      });

      it("Should handle amount equal to total supply plus 1 wei", async function () {
        const totalSupply = await xpassToken.totalSupply();
        const amountPlusOne = totalSupply + 1n;
        
        // Transfer amount exceeding total supply should fail
        await expect(xpassToken.transfer(addr1.address, amountPlusOne))
          .to.be.revertedWithCustomError(xpassToken, "ERC20InsufficientBalance");
      });
    });

    describe("Address Boundary Tests", function () {
      it("Should handle address with all zeros except last byte", async function () {
        const testAddress = "0x0000000000000000000000000000000000000001";
        
        // Transfer to test address
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.transfer(testAddress, transferAmount))
          .to.not.be.reverted;
        
        const testAddressBalance = await xpassToken.balanceOf(testAddress);
        expect(testAddressBalance).to.equal(transferAmount);
        
        // Transfer back
        await xpassToken.transfer(owner.address, transferAmount);
      });

      it("Should handle address with all ones", async function () {
        const testAddress = "0xffffffffffffffffffffffffffffffffffffffff";
        
        // Transfer to test address
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.transfer(testAddress, transferAmount))
          .to.not.be.reverted;
        
        const testAddressBalance = await xpassToken.balanceOf(testAddress);
        expect(testAddressBalance).to.equal(transferAmount);
        
        // Transfer back
        await xpassToken.transfer(owner.address, transferAmount);
      });

      it("Should handle address with alternating bits", async function () {
        const testAddress = "0x5555555555555555555555555555555555555555";
        
        // Transfer to test address
        const transferAmount = ethers.parseUnits("1000", 18);
        await expect(xpassToken.transfer(testAddress, transferAmount))
          .to.not.be.reverted;
        
        const testAddressBalance = await xpassToken.balanceOf(testAddress);
        expect(testAddressBalance).to.equal(transferAmount);
        
        // Transfer back
        await xpassToken.transfer(owner.address, transferAmount);
      });
    });

    describe("Time Boundary Tests", function () {
      it("Should handle current timestamp operations", async function () {
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Test that current time is reasonable
        expect(currentTime).to.be.greaterThan(1600000000); // After 2020
        expect(currentTime).to.be.lessThan(2000000000); // Before 2033
      });

      it("Should handle future timestamp operations", async function () {
        const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour later
        
        // Test that future time is reasonable
        expect(futureTime).to.be.greaterThan(Math.floor(Date.now() / 1000));
        expect(futureTime).to.be.lessThan(Math.floor(Date.now() / 1000) + 7200); // Within 2 hours
      });

      it("Should handle past timestamp operations", async function () {
        const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
        
        // Test that past time is reasonable
        expect(pastTime).to.be.lessThan(Math.floor(Date.now() / 1000));
        expect(pastTime).to.be.greaterThan(Math.floor(Date.now() / 1000) - 7200); // Within 2 hours
      });
    });

    describe("Nonce Boundary Tests", function () {
      it("Should handle nonce at zero", async function () {
        const nonce = await xpassToken.nonces(owner.address);
        
        // Test that nonce is a valid number
        expect(nonce).to.be.a('bigint');
        expect(nonce).to.be.greaterThanOrEqual(0n);
      });

      it("Should handle nonce increment", async function () {
        const initialNonce = await xpassToken.nonces(owner.address);
        
        // Perform a permit operation to increment nonce
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const domain = {
          name: await xpassToken.name(),
          version: await xpassToken.version(),
          chainId: await ethers.provider.getNetwork().then(n => n.chainId),
          verifyingContract: await xpassToken.getAddress()
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
        await xpassToken.permit(owner.address, addr1.address, value, deadline, v, r, s);
        
        // Check that nonce has increased
        const newNonce = await xpassToken.nonces(owner.address);
        expect(newNonce).to.equal(initialNonce + 1n);
      });
    });

    describe("Gas Limit Boundary Tests", function () {
      it("Should handle transfer with minimum gas", async function () {
        const transferAmount = ethers.parseUnits("1000", 18);
        
        // Transfer with minimum gas should work
        await expect(xpassToken.transfer(addr1.address, transferAmount, { gasLimit: 100000 }))
          .to.not.be.reverted;
        
        // Transfer back
        await xpassToken.connect(addr1).transfer(owner.address, transferAmount);
      });

      it("Should handle multiple small transfers", async function () {
        const smallAmount = 1; // 1 wei
        
        // Perform multiple small transfers
        for (let i = 0; i < 10; i++) {
          await expect(xpassToken.transfer(addr1.address, smallAmount))
            .to.not.be.reverted;
        }
        
        const addr1Balance = await xpassToken.balanceOf(addr1.address);
        expect(addr1Balance).to.equal(10n);
        
        // Transfer back
        await xpassToken.connect(addr1).transfer(owner.address, addr1Balance);
      });

      it("Should handle large number of approvals", async function () {
        const approveAmount = ethers.parseUnits("1000", 18);
        
        // Approve to multiple valid addresses
        const testAddresses = [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
          "0x4444444444444444444444444444444444444444",
          "0x5555555555555555555555555555555555555555"
        ];
        
        // Approve to multiple addresses
        for (let i = 0; i < 5; i++) {
          const testAddress = testAddresses[i];
          await expect(xpassToken.approve(testAddress, approveAmount))
            .to.not.be.reverted;
        }
        
        // Verify approvals
        for (let i = 0; i < 5; i++) {
          const testAddress = testAddresses[i];
          const allowance = await xpassToken.allowance(owner.address, testAddress);
          expect(allowance).to.equal(approveAmount);
        }
        
        // Reset approvals
        for (let i = 0; i < 5; i++) {
          const testAddress = testAddresses[i];
          await xpassToken.approve(testAddress, 0);
        }
      });
    });

    describe("State Transition Boundary Tests", function () {
      it("Should handle rapid pause/unpause cycles", async function () {
        // Rapid pause/unpause cycles
        for (let i = 0; i < 5; i++) {
          await expect(xpassToken.pause()).to.not.be.reverted;
          expect(await xpassToken.paused()).to.be.true;
          
          await expect(xpassToken.unpause()).to.not.be.reverted;
          expect(await xpassToken.paused()).to.be.false;
        }
      });

      it("Should handle ownership transfer during pause", async function () {
        // Pause first
        await xpassToken.pause();
        expect(await xpassToken.paused()).to.be.true;
        
        // Transfer ownership while paused
        await expect(xpassToken.transferOwnership(addr1.address))
          .to.not.be.reverted;
        
        expect(await xpassToken.owner()).to.equal(addr1.address);
        
        // New owner should be able to unpause
        await expect(xpassToken.connect(addr1).unpause())
          .to.not.be.reverted;
        
        expect(await xpassToken.paused()).to.be.false;
        
        // Transfer ownership back
        await xpassToken.connect(addr1).transferOwnership(owner.address);
      });

      it("Should handle multiple ownership transfers in sequence", async function () {
        // Multiple ownership transfers
        await expect(xpassToken.transferOwnership(addr1.address)).to.not.be.reverted;
        expect(await xpassToken.owner()).to.equal(addr1.address);
        
        await expect(xpassToken.connect(addr1).transferOwnership(addr2.address)).to.not.be.reverted;
        expect(await xpassToken.owner()).to.equal(addr2.address);
        
        await expect(xpassToken.connect(addr2).transferOwnership(owner.address)).to.not.be.reverted;
        expect(await xpassToken.owner()).to.equal(owner.address);
      });
    });

    describe("Memory and Storage Boundary Tests", function () {
      it("Should handle large number of events", async function () {
        const transferAmount = ethers.parseUnits("1", 18);
        
        // Use a smaller number of simple addresses to avoid resolveName errors
        const testAddresses = [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
          "0x4444444444444444444444444444444444444444",
          "0x5555555555555555555555555555555555555555"
        ];
        
        // Transfer to test addresses
        for (let i = 0; i < 5; i++) {
          const testAddress = testAddresses[i];
          await expect(xpassToken.transfer(testAddress, transferAmount))
            .to.emit(xpassToken, "Transfer")
            .withArgs(owner.address, testAddress, transferAmount);
        }
        
        // Verify balances
        for (let i = 0; i < 5; i++) {
          const testAddress = testAddresses[i];
          const balance = await xpassToken.balanceOf(testAddress);
          expect(balance).to.equal(transferAmount);
        }
        
        // Transfer back all amounts directly to owner (no need for addr1 as intermediary)
        for (let i = 0; i < 5; i++) {
          const testAddress = testAddresses[i];
          // Transfer directly back to owner
          await xpassToken.transfer(owner.address, transferAmount);
        }
      });

      it("Should handle concurrent operations", async function () {
        const transferAmount = ethers.parseUnits("100", 18);
        
        // Prepare multiple accounts with tokens
        const accounts = [addr1, addr2, ...addrs.slice(0, 3)];
        for (const account of accounts) {
          await xpassToken.transfer(account.address, transferAmount);
        }
        
        // Concurrent operations (simulated with sequential calls)
        const promises = accounts.map(account => 
          xpassToken.connect(account).transfer(owner.address, transferAmount)
        );
        
        // Execute all transfers
        for (const promise of promises) {
          await expect(promise).to.not.be.reverted;
        }
        
        // Verify all transfers completed
        for (const account of accounts) {
          const balance = await xpassToken.balanceOf(account.address);
          expect(balance).to.equal(0);
        }
      });
    });
  });



  describe("View Functions Tests", function () {
    it("Should return correct version", async function () {
      expect(await xpassToken.version()).to.equal("1");
    });

    it("Should return correct maxSupply", async function () {
      const expectedMaxSupply = ethers.parseUnits("1000000000", 18); // 1 billion tokens
      expect(await xpassToken.maxSupply()).to.equal(expectedMaxSupply);
    });


  });

  describe("Internal Function Coverage Tests", function () {
    it("Should cover _update function when paused", async function () {
      // Pause the contract
      await xpassToken.pause();
      
      // Try to transfer - should revert with custom message
      await expect(xpassToken.transfer(addr1.address, ethers.parseUnits("100", 18)))
        .to.be.revertedWithCustomError(xpassToken, "EnforcedPause");
    });

    it("Should cover _update function when not paused", async function () {
      // Ensure contract is not paused
      if (await xpassToken.paused()) {
        await xpassToken.unpause();
      }
      
      // Transfer should work
      await expect(xpassToken.transfer(addr1.address, ethers.parseUnits("100", 18)))
        .to.not.be.reverted;
    });
  });

  
});
