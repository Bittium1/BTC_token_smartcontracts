This repository has the contracts that implement the wrapped token for BTC, DOGE, ETH and XRP on EVM networks.

# Installation

Node.js 22.13 or newer is required.

    npm ci

# Compilation

    npm run compile

Compilation and the local EVM test network are provided by Hardhat 3. The
Solidity compiler remains pinned to 0.4.24 for reproducible legacy-contract
bytecode.

# Testing

    npm test

# Testing Coverage

    npm run coverage

# Deployment

    node deployer.cjs --input-file [file] --gas-price-gwei [gwei] --rpc-url [url] --token-name [string] --dont-send-tx [bool] --skip-add-members [bool]
