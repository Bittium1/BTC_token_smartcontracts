#!/usr/bin/env node

const { inputFile, gasPriceGwei, rpcUrl, sendTx } = require('yargs')
  .usage('Usage: $0 --input-file [file] --gas-price-gwei [gwei] --rpc-url [url] [--send-tx]')
  .demandOption(['inputFile', 'gasPriceGwei', 'rpcUrl'])
  .boolean('sendTx')
  .default('sendTx', false)
  .argv;

const deployer = require("./deployerImplementation.cjs");
deployer.deploy(inputFile, gasPriceGwei, rpcUrl, !sendTx).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
