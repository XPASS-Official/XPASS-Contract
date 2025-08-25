const { ethers } = require("hardhat");

async function main() {
  console.log("Starting XPass token deployment...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Get XPassToken contract factory
  const XPassToken = await ethers.getContractFactory("XPassToken");
  
  // Deploy contract (set deployer as initial owner)
  console.log("Deploying XPassToken contract...");
  const xpassToken = await XPassToken.deploy(deployer.address);
  
  // Wait for deployment to complete
  await xpassToken.waitForDeployment();
  
  // Get deployed contract address
  const contractAddress = await xpassToken.getAddress();
  
  console.log("XPassToken deployed successfully!");
  console.log("Contract address:", contractAddress);
  console.log("Deployer:", deployer.address);
  
  // Output token information
  const name = await xpassToken.name();
  const symbol = await xpassToken.symbol();
  const decimals = await xpassToken.decimals();
  const totalSupply = await xpassToken.totalSupply();
  const owner = await xpassToken.owner();
  
  console.log("\n=== Token Information ===");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Total Supply:", ethers.formatUnits(totalSupply, decimals), symbol);
  console.log("Owner:", owner);
  
  // Check deployer balance
  const deployerBalance = await xpassToken.balanceOf(deployer.address);
  console.log("Deployer Balance:", ethers.formatUnits(deployerBalance, decimals), symbol);
  
  console.log("\nDeployment completed!");
  console.log("To verify the contract, use the following command:");
  console.log(`npx hardhat verify --network ${network.name} ${contractAddress} "${deployer.address}"`);
}

// Error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error during deployment:", error);
    process.exit(1);
  });
