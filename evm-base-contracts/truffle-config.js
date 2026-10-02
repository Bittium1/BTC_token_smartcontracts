const Ganache = require("ganache");

const testProvider = Ganache.provider({
  chain: {
    chainId: 5777,
    hardfork: "istanbul",
    networkId: 5777,
    vmErrorsOnRPCResponse: true
  },
  logging: {
    quiet: true
  },
  miner: {
    blockGasLimit: 6000000,
    defaultGasPrice: 40000000000
  },
  wallet: {
    deterministic: true,
    totalAccounts: 20
  }
});

module.exports = {
  compilers: {
    solc: {
      version: "0.4.24",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  contracts_directory: "./contracts",
  networks: {
    test: {
      provider: () => testProvider,
      gas: 6000000,
      gasPrice: 40000000000,
      network_id: "*"
    },
    development: {
      host: "localhost",
      port: 8545,
      gas: 6000000,
      gasPrice: 40000000000,
      network_id: "*" // Match any network id
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555,         // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    },
  },
};
