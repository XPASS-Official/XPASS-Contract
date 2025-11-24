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
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: parseInt(process.env.BSC_TESTNET_CHAIN_ID) || 97,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      timeout: 60000,
      gas: 8000000,
      gasPrice: 10000000000
    },
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed1.binance.org",
      chainId: parseInt(process.env.BSC_MAINNET_CHAIN_ID) || 56,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      timeout: 60000,
      gas: 8000000,
      gasPrice: 5000000000
    }
  },
  etherscan: {
    apiKey: {
      testnet: "unnecessary",
      mainnet: "unnecessary",
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
      bscMainnet: process.env.BSCSCAN_API_KEY || "",
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
      },
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        }
      },
      {
        network: "bscMainnet",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com",
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
