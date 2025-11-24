const { ethers } = require("hardhat");

async function main() {
  console.log("Starting XPassKaiaBridge deployment...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "KAI");

  // Get network information
  const network = await ethers.provider.getNetwork();
  console.log("\nNetwork Information:");
  console.log("Chain ID:", network.chainId.toString());
  console.log("Network Name:", network.name);

  // Check if we're on Kaia network
  const isKaiaMainnet = network.chainId === 8217n;
  const isKaiaTestnet = network.chainId === 1001n;
  
  if (!isKaiaMainnet && !isKaiaTestnet) {
    console.warn("⚠️  Warning: This contract is designed for Kaia networks (Mainnet: 8217, Testnet: 1001)");
    console.warn("Current chain ID:", network.chainId.toString());
  }

  // Step 1: Get deployment parameters
  console.log("\n=== Step 1: Deployment Parameters ===");
  
  const xpassTokenAddress = process.env.XPASS_TOKEN_ADDRESS;
  const bscTokenAddress = process.env.BSC_TOKEN_ADDRESS;
  const bscChainId = process.env.BSC_CHAIN_ID ? parseInt(process.env.BSC_CHAIN_ID) : (isKaiaMainnet ? 56 : 97);
  const initialOwner = process.env.BRIDGE_OWNER || deployer.address;
  const initialUnlocker = process.env.BRIDGE_UNLOCKER || deployer.address;
  const timelockControllerAddress = process.env.TIMELOCK_CONTROLLER_ADDRESS;

  if (!xpassTokenAddress) {
    throw new Error(`
❌ XPASS_TOKEN_ADDRESS environment variable is required!

Please set the XPassToken contract address in your .env file:
XPASS_TOKEN_ADDRESS=0x1234567890123456789012345678901234567890
    `);
  }

  if (!bscTokenAddress) {
    throw new Error(`
❌ BSC_TOKEN_ADDRESS environment variable is required!

Please set the BSC token contract address in your .env file:
BSC_TOKEN_ADDRESS=0x1234567890123456789012345678901234567890
    `);
  }

  if (!timelockControllerAddress) {
    throw new Error(`
❌ TIMELOCK_CONTROLLER_ADDRESS environment variable is required!

Please set the TimelockController contract address in your .env file:
TIMELOCK_CONTROLLER_ADDRESS=0x1234567890123456789012345678901234567890

Note: This should be the same TimelockController used for XPassToken deployment.
    `);
  }

  console.log("XPassToken Address:", xpassTokenAddress);
  console.log("BSC Token Address:", bscTokenAddress);
  console.log("BSC Chain ID:", bscChainId);
  console.log("Initial Owner:", initialOwner);
  console.log("Initial Unlocker:", initialUnlocker);
  console.log("TimelockController Address:", timelockControllerAddress);
  console.log("\nNote: Initial unlocker should be the off-chain relayer address or Multi-Sig");

  // Verify XPassToken contract
  console.log("\n=== Step 2: Verifying XPassToken Contract ===");
  try {
    const xpassToken = await ethers.getContractAt("XPassToken", xpassTokenAddress);
    const name = await xpassToken.name();
    const symbol = await xpassToken.symbol();
    const totalSupply = await xpassToken.totalSupply();
    console.log("✅ XPassToken verified:");
    console.log("  Name:", name);
    console.log("  Symbol:", symbol);
    console.log("  Total Supply:", ethers.formatEther(totalSupply), symbol);
  } catch (error) {
    console.warn("⚠️  Could not verify XPassToken contract:", error.message);
  }

  // Step 3: Deploy XPassKaiaBridge
  console.log("\n=== Step 3: Deploying XPassKaiaBridge ===");
  const XPassKaiaBridge = await ethers.getContractFactory("XPassKaiaBridge");
  
  console.log("Deploying contract...");
  const kaiaBridge = await XPassKaiaBridge.deploy(
    xpassTokenAddress,
    bscTokenAddress,
    bscChainId,
    initialOwner,
    initialUnlocker,
    timelockControllerAddress
  );
  
  await kaiaBridge.waitForDeployment();
  const bridgeAddress = await kaiaBridge.getAddress();
  
  console.log("✅ XPassKaiaBridge deployed successfully!");
  console.log("Bridge address:", bridgeAddress);

  // Step 4: Verify contract state
  console.log("\n=== Step 4: Verifying Contract State ===");
  
  const xpassTokenAddr = await kaiaBridge.xpassToken();
  const bscTokenAddr = await kaiaBridge.bscTokenAddress();
  const bscChainIdValue = await kaiaBridge.bscChainId();
  const minLockAmount = await kaiaBridge.minLockAmount();
  const contractBalance = await kaiaBridge.getContractBalance();
  
  console.log("XPassToken Address:", xpassTokenAddr);
  console.log("BSC Token Address:", bscTokenAddr);
  console.log("BSC Chain ID:", bscChainIdValue.toString());
  console.log("Min Lock Amount:", ethers.formatEther(minLockAmount), "XPASS");
  console.log("Contract Balance:", ethers.formatEther(contractBalance), "XPASS");

  // Step 5: Verify roles
  console.log("\n=== Step 5: Verifying Roles ===");
  
  const DEFAULT_ADMIN_ROLE = await kaiaBridge.DEFAULT_ADMIN_ROLE();
  const UNLOCKER_ROLE = await kaiaBridge.UNLOCKER_ROLE();
  const PAUSER_ROLE = await kaiaBridge.PAUSER_ROLE();
  
  const deployerHasAdmin = await kaiaBridge.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  const ownerHasAdmin = await kaiaBridge.hasRole(DEFAULT_ADMIN_ROLE, initialOwner);
  const unlockerHasUnlockerRole = await kaiaBridge.hasRole(UNLOCKER_ROLE, initialUnlocker);
  const ownerHasPauser = await kaiaBridge.hasRole(PAUSER_ROLE, initialOwner);
  
  console.log("Deployer has ADMIN_ROLE:", deployerHasAdmin);
  console.log("Owner has ADMIN_ROLE:", ownerHasAdmin);
  console.log("Unlocker has UNLOCKER_ROLE:", unlockerHasUnlockerRole);
  console.log("Owner has PAUSER_ROLE:", ownerHasPauser);

  // Step 6: Output deployment information
  console.log("\n=== Step 6: Deployment Summary ===");
  console.log("Bridge Contract Address:", bridgeAddress);
  console.log("XPassToken Address:", xpassTokenAddress);
  console.log("BSC Token Address:", bscTokenAddress);
  console.log("BSC Chain ID:", bscChainId);
  console.log("Owner Address:", initialOwner);
  console.log("Initial Unlocker Address:", initialUnlocker);
  
  if (isKaiaTestnet) {
    console.log("\n🔗 Block Explorer:");
    console.log(`  Bridge: https://kairos.kaiascan.io/address/${bridgeAddress}`);
    console.log(`  Token: https://kairos.kaiascan.io/address/${xpassTokenAddress}`);
  } else if (isKaiaMainnet) {
    console.log("\n🔗 Block Explorer:");
    console.log(`  Bridge: https://kaiascan.io/address/${bridgeAddress}`);
    console.log(`  Token: https://kaiascan.io/address/${xpassTokenAddress}`);
  }

  // Step 7: Verification commands
  console.log("\n=== Step 7: Verification Commands ===");
  console.log("To verify the contract on block explorer:");
  console.log(`npx hardhat verify --network ${network.name} "${bridgeAddress}" "${xpassTokenAddress}" "${bscTokenAddress}" "${bscChainId}" "${initialOwner}" "${initialUnlocker}" "${timelockControllerAddress}"`);

  // Step 8: Next steps
  console.log("\n=== Step 8: Next Steps ===");
  console.log("1. Verify the contract on block explorer");
  console.log("2. Update off-chain relayer with bridge address");
  console.log("3. Test lock functionality:");
  console.log(`   - Approve bridge: xpassToken.approve("${bridgeAddress}", amount)`);
  console.log(`   - Lock tokens: kaiaBridge.lockTokens(amount, bscRecipientAddress)`);
  console.log("4. Test unlock functionality (requires UNLOCKER_ROLE):");
  console.log(`   - Unlock: kaiaBridge.unlockTokens(recipient, amount, bscTxHash)`);
  console.log("5. Monitor events for off-chain processing");

  // Step 9: Important security notes
  console.log("\n=== Step 9: Security Notes ===");
  console.log("⚠️  IMPORTANT:");
  console.log("  - UNLOCKER_ROLE should be granted to trusted off-chain relayer or Multi-Sig");
  console.log("  - Off-chain relayer must verify BSC burn transactions before unlocking");
  console.log("  - Monitor bridge contract balance regularly");
  console.log("  - Use pause() function in emergency situations");

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    bridgeAddress: bridgeAddress,
    xpassTokenAddress: xpassTokenAddress,
    bscTokenAddress: bscTokenAddress,
    bscChainId: bscChainId.toString(),
    owner: initialOwner,
    initialUnlocker: initialUnlocker,
    timelockControllerAddress: timelockControllerAddress,
    deployedAt: new Date().toISOString()
  };

  console.log("\n=== Deployment Info (JSON) ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });



