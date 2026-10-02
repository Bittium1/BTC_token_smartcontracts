#!/usr/bin/env node

const { inputFile, gasPriceGwei, rpcUrl, sendTx, tokenName, skipAddMembers } = require('yargs')
  .usage('Usage: $0 --input-file [file] --gas-price-gwei [gwei] --rpc-url [url] --token-name [string] [--send-tx] [--skip-add-members]')
  .demandOption(['inputFile', 'gasPriceGwei', 'rpcUrl', 'tokenName'])
  .boolean(['sendTx', 'skipAddMembers'])
  .default('sendTx', false)
  .default('skipAddMembers', false)
  .argv;

const deployer = require("./deployerImplementation.cjs");
deployer.deploy(inputFile, gasPriceGwei, rpcUrl, !sendTx, tokenName, skipAddMembers).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
