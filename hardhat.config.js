require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
      chainId: parseInt(process.env.LOCAL_CHAIN_ID) || 1337
    },
    testnet: {
      url: process.env.KAIA_TESTNET_RPC_URL || "https://public-en-kairos.node.kaia.io",
      chainId: parseInt(process.env.KAIA_TESTNET_CHAIN_ID) || 1001,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      timeout: 60000,
      gas: 8000000,
      gasPrice: 25000000000 
    },
    mainnet: {
      url: process.env.KAIA_MAINNET_RPC_URL || "https://public-en.node.kaia.io",
      chainId: parseInt(process.env.KAIA_MAINNET_CHAIN_ID) || 8217,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      timeout: 60000,
      gas: 8000000,
      gasPrice: 25000000000 
    }
  },
  etherscan: {
    apiKey: {
      testnet: "unnecessary",
      mainnet: "unnecessary",
    },
    customChains: [
      {
        network: "testnet",
        chainId: 1001,
        urls: {
          apiURL: "https://kairos-api.kaiascan.io/hardhat-verify",
          browserURL: "https://kairos.kaiascan.io",
        }
      },
      {
        network: "mainnet",
        chainId: 8217,
        urls: {
          apiURL: "https://mainnet-api.kaiascan.io/hardhat-verify",
          browserURL: "https://kaiascan.io",
        }
      }
    ]
  },
  sourcify: {
    enabled: false
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
