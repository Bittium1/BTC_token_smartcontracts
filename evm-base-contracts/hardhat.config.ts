import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers, hardhatMocha],
  paths: {
    sources: "./contracts",
    tests: {
      mocha: "./test",
    },
    cache: "./cache",
    artifacts: "./artifacts",
  },
  solidity: {
    version: "0.4.24",
    preferWasm: true,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 5777,
      hardfork: "istanbul",
      blockGasLimit: 6_000_000,
      gas: 6_000_000,
      gasPrice: 40_000_000_000,
    },
  },
  test: {
    mocha: {
      timeout: 120_000,
      require: ["./test-support/truffle-compat.cjs"],
    },
  },
});
