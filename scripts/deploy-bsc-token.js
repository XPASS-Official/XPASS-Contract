const { ethers } = require("hardhat");

async function main() {
  console.log("Starting XPassTokenBSC deployment...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Get network information
  const network = await ethers.provider.getNetwork();
  console.log("\nNetwork Information:");
  console.log("Chain ID:", network.chainId.toString());
  console.log("Network Name:", network.name);

  // Check if we're on BSC network
  const isBSCMainnet = network.chainId === 56n;
  const isBSCTestnet = network.chainId === 97n;
  
  if (!isBSCMainnet && !isBSCTestnet) {
    console.warn("⚠️  Warning: This contract is designed for BSC networks (Mainnet: 56, Testnet: 97)");
    console.warn("Current chain ID:", network.chainId.toString());
  }

  // Step 1: Deploy TimelockController
  console.log("\n=== Step 1: Deploying TimelockController ===");
  const XPassTimelockController = await ethers.getContractFactory("XPassTimelockController");
  
  // TimelockController parameters
  // Check if we're on mainnet - if so, force 48 hours for security
  let minDelay;
  if (isBSCMainnet) {
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

  // Step 2: Deploy XPassTokenBSC
  console.log("\n=== Step 2: Deploying XPassTokenBSC ===");
  const XPassTokenBSC = await ethers.getContractFactory("XPassTokenBSC");
  
  // Get deployment parameters
  const initialOwner = process.env.BSC_TOKEN_OWNER || multisigAddress;
  const initialMinter = process.env.BSC_TOKEN_MINTER || deployer.address;
  
  console.log("Deploying XPassTokenBSC with Multi-Sig as owner and TimelockController as timelock controller...");
  console.log("Initial Owner:", initialOwner);
  console.log("Initial Minter:", initialMinter);
  console.log("TimelockController:", timelockAddress);
  console.log("\nNote: Initial minter should be the bridge contract address");
  console.log("You can change minter later using grantMinterRole()");
  console.log("Note: pause/unpause functions require TimelockController");
  
  const xpassTokenBSC = await XPassTokenBSC.deploy(initialOwner, initialMinter, timelockAddress);
  
  await xpassTokenBSC.waitForDeployment();
  const tokenAddress = await xpassTokenBSC.getAddress();
  
  console.log("✅ XPassTokenBSC deployed successfully!");
  console.log("Token address:", tokenAddress);

  // Step 3: Verify ownership setup
  console.log("\n=== Step 3: Verifying Ownership Setup ===");
  
  // Verify XPassTokenBSC owner
  const xpassOwner = await xpassTokenBSC.owner();
  console.log("XPassTokenBSC owner:", xpassOwner);
  console.log("Expected owner:", initialOwner);
  console.log("Ownership correctly set:", xpassOwner.toLowerCase() === initialOwner.toLowerCase());
  
  // Verify TimelockController address
  const xpassTimelockController = await xpassTokenBSC.getTimelockController();
  console.log("XPassTokenBSC timelock controller:", xpassTimelockController);
  console.log("TimelockController address:", timelockAddress);
  console.log("Timelock controller correctly set:", xpassTimelockController.toLowerCase() === timelockAddress.toLowerCase());

  // Step 4: Verify contract state
  console.log("\n=== Step 4: Verifying Contract State ===");
  
  const name = await xpassTokenBSC.name();
  const symbol = await xpassTokenBSC.symbol();
  const decimals = await xpassTokenBSC.decimals();
  const totalSupply = await xpassTokenBSC.totalSupply();
  const maxSupply = await xpassTokenBSC.maxSupply();
  const totalMinted = await xpassTokenBSC.totalMinted();
  const remainingMintable = await xpassTokenBSC.remainingMintableSupply();
  
  console.log("\n=== Token Information ===");
  console.log("Token Name:", name);
  console.log("Token Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Initial Supply:", ethers.formatUnits(totalSupply, decimals), symbol, "(✅ Should be 0)");
  console.log("Max Supply:", ethers.formatUnits(maxSupply, decimals), symbol);
  console.log("Total Minted:", ethers.formatUnits(totalMinted, decimals), symbol, "(✅ Should be 0)");
  console.log("Remaining Mintable:", ethers.formatUnits(remainingMintable, decimals), symbol);
  
  // Verify initial supply is 0
  if (totalSupply === 0n && totalMinted === 0n) {
    console.log("\n✅ Initial supply verification: PASSED (0 tokens)");
  } else {
    console.log("\n❌ WARNING: Initial supply is NOT 0!");
    console.log("   This should not happen. Please check the contract deployment.");
  }

  // Step 5: Verify roles
  console.log("\n=== Step 5: Verifying Roles ===");
  
  const DEFAULT_ADMIN_ROLE = await xpassTokenBSC.DEFAULT_ADMIN_ROLE();
  const MINTER_ROLE = await xpassTokenBSC.MINTER_ROLE();
  
  const deployerHasAdmin = await xpassTokenBSC.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  const ownerHasAdmin = await xpassTokenBSC.hasRole(DEFAULT_ADMIN_ROLE, initialOwner);
  const minterHasMinterRole = await xpassTokenBSC.hasRole(MINTER_ROLE, initialMinter);
  
  console.log("Deployer has ADMIN_ROLE:", deployerHasAdmin);
  console.log("Owner has ADMIN_ROLE:", ownerHasAdmin);
  console.log("Minter has MINTER_ROLE:", minterHasMinterRole);

  // Step 6: Verify security configuration
  console.log("\n=== Step 6: Security Verification ===");
  
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

  // Step 7: Output deployment information
  console.log("\n=== Step 7: Deployment Summary ===");
  console.log("TimelockController address:", timelockAddress);
  console.log("XPassTokenBSC address:", tokenAddress);
  console.log("XPassTokenBSC owner:", xpassOwner);
  console.log("Initial Minter Address:", initialMinter);
  
  if (isBSCTestnet) {
    console.log("\n🔗 Block Explorer:");
    console.log(`  TimelockController: https://testnet.bscscan.com/address/${timelockAddress}`);
    console.log(`  Token: https://testnet.bscscan.com/address/${tokenAddress}`);
  } else if (isBSCMainnet) {
    console.log("\n🔗 Block Explorer:");
    console.log(`  TimelockController: https://bscscan.com/address/${timelockAddress}`);
    console.log(`  Token: https://bscscan.com/address/${tokenAddress}`);
  }

  // Step 8: Verification commands
  console.log("\n=== Step 8: Verification Commands ===");
  console.log("To verify TimelockController:");
  console.log(`npx hardhat verify --network ${network.name} "${timelockAddress}" "${minDelay}" "${admin}"`);
  console.log("\nTo verify XPassTokenBSC:");
  console.log(`npx hardhat verify --network ${network.name} "${tokenAddress}" "${initialOwner}" "${initialMinter}" "${timelockAddress}"`);

  // Step 9: Next steps
  console.log("\n=== Step 9: Next Steps ===");
  console.log("1. Verify all contracts on block explorer");
  console.log("2. Update bridge contract with this token address");
  console.log("3. Grant MINTER_ROLE to bridge contract:");
  console.log(`   xpassTokenBSC.grantMinterRole(bridgeContractAddress)`);
  console.log("4. Test minting tokens through bridge");
  console.log("5. Test burning tokens for Kaia unlock");

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    timelockControllerAddress: timelockAddress,
    contractAddress: tokenAddress,
    owner: initialOwner,
    initialMinter: initialMinter,
    timelockController: timelockAddress,
    deployedAt: new Date().toISOString(),
    maxSupply: maxSupply.toString(),
    initialSupply: totalSupply.toString()
  };

  console.log("\n=== Deployment Info (JSON) ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\nDeployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error during deployment:", error);
    process.exit(1);
  });
