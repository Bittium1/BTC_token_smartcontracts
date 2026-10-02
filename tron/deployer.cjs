#!/usr/bin/env node

const path = require("node:path");
const { hideBin } = require("yargs/helpers");
const yargs = require("yargs/yargs");

const argv = yargs(hideBin(process.argv))
  .usage("Usage: $0 --input-file [file] --artifacts-dir [directory] --fee-limit [number] --energy-limit [number] --user-fee-percentage [number] --rpc-url [url] --token-name [string] [--send-tx]")
  .option("inputFile", {type: "string", demandOption: true})
  .option("artifactsDir", {type: "string", default: path.join("build", "contracts")})
  .option("feeLimit", {type: "number", demandOption: true})
  .option("energyLimit", {type: "number", demandOption: true})
  .option("userFeePercentage", {type: "number", demandOption: true})
  .option("rpcUrl", {type: "string", demandOption: true})
  .option("tokenName", {type: "string", choices: ["WBTC", "WETH"], demandOption: true})
  .option("sendTx", {
    type: "boolean",
    default: false,
    describe: "Broadcast deployments and setup transactions",
  })
  .strict()
  .parseSync();

const deployer = require("./deployerImplementation.cjs");
deployer.deploy(
  argv.inputFile,
  argv.feeLimit,
  argv.energyLimit,
  argv.userFeePercentage,
  argv.rpcUrl,
  !argv.sendTx,
  argv.tokenName,
  argv.artifactsDir,
).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
