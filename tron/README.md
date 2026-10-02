# Tron contracts

This directory preserves the wrapped BTC and wrapped ETH contracts for Tron.
Node.js 22.13 or newer is required.

## Install and test

    npm ci
    npm run compile
    npm test
    npm run coverage

The local Hardhat build and tests are EVM-compatible regression checks. They do
not contact Shasta, Nile, Mainnet, or any other external network.

## Prepare release artifacts

Compile deployment artifacts with a Tron-compatible Solidity 0.4.24 compiler
and optimizer settings matching this repository (`enabled: true`, `runs: 200`).
TronBox or TronIDE can produce the required ABI and bytecode JSON files. Place
the results under `build/contracts`, or pass another directory with
`--artifacts-dir`. Do not use the Hardhat regression artifacts for a release
deployment without independently verifying compiler compatibility and bytecode.

Copy `deployerInput.example.json` and replace its three public account addresses.
The config deliberately contains no private keys. Never commit a private key;
for an authorized broadcast, provide the deployer key through the
`TRON_PRIVATE_KEY` environment variable in the current shell only.

## Validate a deployment plan

The command is non-broadcasting by default. It validates the public config,
parameters, ABI files, and bytecode without connecting to the RPC endpoint:

    node deployer.cjs --input-file [file] --artifacts-dir [directory] --fee-limit [number] --energy-limit [number] --user-fee-percentage [1-99] --rpc-url [url] --token-name [WBTC|WETH]

## Broadcast

Broadcast requires both the `TRON_PRIVATE_KEY` environment variable and the
explicit `--send-tx` flag. Review the network, artifacts, account addresses,
fees, and dry-run result before using it:

    node deployer.cjs --input-file [file] --artifacts-dir [directory] --fee-limit [number] --energy-limit [number] --user-fee-percentage [1-99] --rpc-url [url] --token-name [WBTC|WETH] --send-tx

`fee-limit` is measured in SUN (1 TRX = 1,000,000 SUN). `energy-limit` is the
maximum origin energy, and `user-fee-percentage` is restricted to 1 through 99.
