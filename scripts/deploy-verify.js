const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

async function main() {
  console.log("🚀 Starting deployment and verification process...\n");

  // Get network from command line arguments or default to testnet
  const network = process.argv.includes("--network") 
    ? process.argv[process.argv.indexOf("--network") + 1] 
    : "testnet";

  console.log(`📡 Target network: ${network}\n`);

  try {
    // First, run the deployment script
    console.log("📦 Deploying contracts...");
    const { stdout: deployOutput, stderr: deployError } = await execAsync(`npx hardhat run scripts/deploy.js --network ${network}`);
    
    if (deployError) {
      console.error("❌ Deployment failed:", deployError);
      process.exit(1);
    }
    
    console.log(deployOutput);
    
    // Extract contract addresses from deployment output
    const timelockMatch = deployOutput.match(/TimelockController address: (0x[a-fA-F0-9]+)/);
    const tokenMatch = deployOutput.match(/XPassToken address: (0x[a-fA-F0-9]+)/);
    const multisigMatch = deployOutput.match(/XPassToken owner: (0x[a-fA-F0-9]+)/);
    
    if (!timelockMatch || !tokenMatch || !multisigMatch) {
      console.error("❌ Failed to extract contract addresses from deployment output");
      process.exit(1);
    }
    
    const timelockAddress = timelockMatch[1];
    const tokenAddress = tokenMatch[1];
    const multisigAddress = multisigMatch[1];
    
    console.log(`\n📍 Extracted addresses:`);
    console.log(`   TimelockController: ${timelockAddress}`);
    console.log(`   XPassToken: ${tokenAddress}`);
    console.log(`   Multi-Sig: ${multisigAddress}`);
    
    console.log("\n⏳ Waiting 5 seconds for block confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify TimelockController
    console.log("\n🔍 Verifying TimelockController...");
    try {
      const { stdout: timelockVerifyOutput, stderr: timelockVerifyError } = await execAsync(
        `npx hardhat verify --network ${network} "${timelockAddress}" "172800" "${multisigAddress}"`
      );
      
      if (timelockVerifyError) {
        console.error("❌ TimelockController verification failed:", timelockVerifyError);
      } else {
        console.log("✅ TimelockController verified successfully!");
        console.log(timelockVerifyOutput);
      }
    } catch (error) {
      console.error("❌ TimelockController verification error:", error.message);
    }

    // Verify XPassToken
    console.log("\n🔍 Verifying XPassToken...");
    try {
      const { stdout: tokenVerifyOutput, stderr: tokenVerifyError } = await execAsync(
        `npx hardhat verify --network ${network} "${tokenAddress}" "${multisigAddress}" "${timelockAddress}"`
      );
      
      if (tokenVerifyError) {
        console.error("❌ XPassToken verification failed:", tokenVerifyError);
      } else {
        console.log("✅ XPassToken verified successfully!");
        console.log(tokenVerifyOutput);
      }
    } catch (error) {
      console.error("❌ XPassToken verification error:", error.message);
    }

    // Display verification URLs
    console.log("\n🌐 Verification URLs:");
    if (network === "testnet") {
      console.log(`   TimelockController: https://kairos.kaiascan.io/address/${timelockAddress}`);
      console.log(`   XPassToken: https://kairos.kaiascan.io/address/${tokenAddress}`);
    } else if (network === "mainnet") {
      console.log(`   TimelockController: https://kaiascan.io/address/${timelockAddress}`);
      console.log(`   XPassToken: https://kaiascan.io/address/${tokenAddress}`);
    } else {
      console.log(`   TimelockController: ${timelockAddress}`);
      console.log(`   XPassToken: ${tokenAddress}`);
    }

    console.log("\n🎉 Deployment and verification process completed!");

  } catch (error) {
    console.error("❌ Script execution failed:", error.message);
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Script execution failed:", error);
      process.exit(1);
    });
}

module.exports = main;
