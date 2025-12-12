const { ethers } = require("hardhat");

async function main() {
  console.log("Starting XPass token deployment...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Step 1: Deploy TimelockController
  console.log("\n=== Step 1: Deploying TimelockController ===");
  const XPassTimelockController = await ethers.getContractFactory("XPassTimelockController");
  
  // TimelockController parameters
  // Check if we're on mainnet - if so, force 48 hours for security
  const network = await ethers.provider.getNetwork();
  const isMainnet = network.chainId === 56n; // BSC mainnet chain ID
  
  let minDelay;
  if (isMainnet) {
    // Mainnet: Always use 48 hours for security
    minDelay = 48 * 60 * 60;
    console.log("🔒 MAINNET DETECTED: Using 48-hour delay for security");
  } else {
    // Testnet/Other: Use environment variable or default to 48 hours
    minDelay = process.env.TIMELOCK_DELAY ? parseInt(process.env.TIMELOCK_DELAY) : 48 * 60 * 60;
    console.log("🧪 TESTNET/OTHER: Using configurable delay");
  }
  
  // Convert to human readable format for logging
  const delayHours = minDelay / 3600;
  const delayMinutes = (minDelay % 3600) / 60;
  const delaySeconds = minDelay % 60;
  
  // IMPORTANT: For production deployment, use Multi-Sig addresses
  // Deployer should NOT have any roles in production
  const multisigAddress = process.env.MULTISIG_ADDRESS;
  
  if (!multisigAddress) {
    throw new Error(`
❌ MULTISIG_ADDRESS environment variable is required!

Please set the Multi-Sig address in your .env file:
MULTISIG_ADDRESS=0x1234567890123456789012345678901234567890

For testnet/mainnet deployment, you MUST use a Multi-Sig address for security.
The deployer address should only be used for deployment, not for governance roles.
    `);
  }
  
  const admin = multisigAddress; // Multi-Sig as admin (will be used for all roles)
  
  console.log("TimelockController parameters:");
  console.log("- Min Delay:", minDelay, "seconds");
  if (delayHours >= 1) {
    console.log(`  (${delayHours} hours ${delayMinutes} minutes ${delaySeconds} seconds)`);
  } else if (delayMinutes >= 1) {
    console.log(`  (${delayMinutes} minutes ${delaySeconds} seconds)`);
  } else {
    console.log(`  (${delaySeconds} seconds)`);
  }
  console.log("- Admin (Multi-Sig):", admin);
  console.log("- Note: Admin will be used for all roles (proposer, executor, admin)");
  
  const timelockController = await XPassTimelockController.deploy(
    minDelay,
    admin
  );
  
  await timelockController.waitForDeployment();
  const timelockAddress = await timelockController.getAddress();
  
  console.log("TimelockController deployed successfully!");
  console.log("TimelockController address:", timelockAddress);

  // Step 2: Deploy XPassToken with TimelockController as initial owner
  console.log("\n=== Step 2: Deploying XPassToken ===");
  const XPassToken = await ethers.getContractFactory("XPassToken");
  
  console.log("Deploying XPassToken with Multi-Sig as owner and TimelockController as timelock controller...");
  const xpassToken = await XPassToken.deploy(multisigAddress, timelockAddress);
  
  await xpassToken.waitForDeployment();
  const xpassAddress = await xpassToken.getAddress();
  
  console.log("XPassToken deployed successfully!");
  console.log("XPassToken address:", xpassAddress);

  // Step 3: Verify ownership setup
  console.log("\n=== Step 3: Verifying Ownership Setup ===");
  
  // Verify XPassToken owner is Multi-Sig
  const xpassOwner = await xpassToken.owner();
  console.log("XPassToken owner:", xpassOwner);
  console.log("Multi-Sig address:", multisigAddress);
  console.log("Ownership correctly set:", xpassOwner.toLowerCase() === multisigAddress.toLowerCase());
  
  // Verify TimelockController address
  const xpassTimelockController = await xpassToken.timelockController();
  console.log("XPassToken timelock controller:", xpassTimelockController);
  console.log("TimelockController address:", timelockAddress);
  console.log("Timelock controller correctly set:", xpassTimelockController.toLowerCase() === timelockAddress.toLowerCase());
  
  // Note: All tokens are minted to Multi-Sig (owner)
  console.log("\n=== Token Distribution ===");
  console.log("All tokens are held by Multi-Sig (owner)");
  console.log("Multi-Sig can distribute tokens immediately without timelock delay");
  console.log("Only pause/unpause functions require timelock delay");
  console.log("\nExample immediate token transfer (Multi-Sig can execute directly):");
  console.log(`xpassToken.transfer(recipient, amount)`);
  console.log("\nExample pause operation (requires timelock delay):");
  console.log(`timelockController.schedule("${xpassAddress}", 0, pauseData, salt, predecessor, ${minDelay})`);
  
  // Step 4: Verify security configuration
  console.log("\n=== Security Verification ===");
  
  // Check TimelockController roles
  const PROPOSER_ROLE = await timelockController.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelockController.EXECUTOR_ROLE();
  const ADMIN_ROLE = await timelockController.DEFAULT_ADMIN_ROLE();
  
  const deployerHasProposerRole = await timelockController.hasRole(PROPOSER_ROLE, deployer.address);
  const deployerHasExecutorRole = await timelockController.hasRole(EXECUTOR_ROLE, deployer.address);
  const deployerHasAdminRole = await timelockController.hasRole(ADMIN_ROLE, deployer.address);
  
  const multisigHasProposerRole = await timelockController.hasRole(PROPOSER_ROLE, multisigAddress);
  const multisigHasExecutorRole = await timelockController.hasRole(EXECUTOR_ROLE, multisigAddress);
  const multisigHasAdminRole = await timelockController.hasRole(ADMIN_ROLE, multisigAddress);
  
  console.log("Role verification:");
  console.log(`- Deployer (${deployer.address}):`);
  console.log(`  - PROPOSER_ROLE: ${deployerHasProposerRole ? '❌ YES (SECURITY RISK!)' : '✅ NO'}`);
  console.log(`  - EXECUTOR_ROLE: ${deployerHasExecutorRole ? '❌ YES (SECURITY RISK!)' : '✅ NO'}`);
  console.log(`  - ADMIN_ROLE: ${deployerHasAdminRole ? '❌ YES (SECURITY RISK!)' : '✅ NO'}`);
  console.log(`- Multi-Sig (${multisigAddress}):`);
  console.log(`  - PROPOSER_ROLE: ${multisigHasProposerRole ? '✅ YES' : '❌ NO'}`);
  console.log(`  - EXECUTOR_ROLE: ${multisigHasExecutorRole ? '✅ YES' : '❌ NO'}`);
  console.log(`  - ADMIN_ROLE: ${multisigHasAdminRole ? '✅ YES' : '❌ NO'}`);
  
  // Security warnings
  if (deployerHasProposerRole || deployerHasExecutorRole || deployerHasAdminRole) {
    console.log("\n⚠️  SECURITY WARNING: Deployer has governance roles!");
    console.log("⚠️  This is a security risk. Consider revoking deployer roles after deployment.");
  } else {
    console.log("\n✅ SECURITY: Deployer has no governance roles - Good!");
  }
  
  if (!multisigHasProposerRole || !multisigHasExecutorRole || !multisigHasAdminRole) {
    console.log("\n❌ CRITICAL: Multi-Sig is missing required roles!");
    console.log("❌ This deployment is NOT secure for production use!");
  } else {
    console.log("\n✅ SECURITY: Multi-Sig has all required roles - Secure!");
  }
  
  // Output deployment information
  console.log("\n=== Deployment Summary ===");
  console.log("TimelockController address:", timelockAddress);
  console.log("XPassToken address:", xpassAddress);
  console.log("XPassToken owner:", xpassOwner);
  
  // Output token information
  const name = await xpassToken.name();
  const symbol = await xpassToken.symbol();
  const decimals = await xpassToken.decimals();
  const totalSupply = await xpassToken.totalSupply();
  
  console.log("\n=== Token Information ===");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Total Supply:", ethers.formatUnits(totalSupply, decimals), symbol);
  
  // Check Multi-Sig balance
  const multisigBalance = await xpassToken.balanceOf(multisigAddress);
  console.log("Multi-Sig Balance:", ethers.formatUnits(multisigBalance, decimals), symbol);
  
  // Check deployer balance
  const deployerBalance = await xpassToken.balanceOf(deployer.address);
  console.log("Deployer Balance:", ethers.formatUnits(deployerBalance, decimals), symbol);
  
  console.log("\n=== Verification Commands ===");
  console.log("To verify TimelockController:");
  console.log(`npx hardhat verify --network <network_name> ${timelockAddress} "${minDelay}" "${admin}"`);
  console.log("\nTo verify XPassToken:");
  console.log(`npx hardhat verify --network <network_name> ${xpassAddress} "${multisigAddress}" "${timelockAddress}"`);
  
  console.log("\n=== Post-Deployment Guide ===");
  console.log("1. Verify all contracts on block explorer");
  console.log("2. Test Multi-Sig functionality:");
  console.log("   - Create a proposal through Multi-Sig");
  console.log("   - Execute proposal after 48-hour delay");
  console.log("3. Monitor contract interactions");
  console.log("4. Keep deployer private key secure but separate from governance");
  
  console.log("\n=== Multi-Sig Operations ===");
  console.log("=== Immediate Operations (No delay) ===");
  console.log("To transfer tokens immediately:");
  console.log(`xpassToken.transfer(recipient, amount)`);
  console.log("To approve tokens immediately:");
  console.log(`xpassToken.approve(spender, amount)`);
  console.log("To transfer ownership immediately:");
  console.log(`xpassToken.transferOwnership(newOwner)`);
  console.log("To renounce ownership immediately:");
  console.log(`xpassToken.renounceOwnership()`);
  
  console.log("\n=== Timelock Operations (48-hour delay) ===");
  console.log("To pause tokens:");
  console.log(`timelockController.schedule(${xpassAddress}, 0, pauseData, salt, predecessor, delay)`);
  console.log("To unpause tokens:");
  console.log(`timelockController.schedule(${xpassAddress}, 0, unpauseData, salt, predecessor, delay)`);
  
  console.log("\n=== Usage Guidelines ===");
  console.log("• Multi-Sig can execute most functions immediately (transfer, approve, ownership)");
  console.log("• Only pause/unpause require timelock delay for security");
  console.log("• All timelock operations require PROPOSER_ROLE and 48-hour delay");
  
  console.log("\nDeployment completed successfully!");
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error during deployment:", error);
    process.exit(1);
  });
