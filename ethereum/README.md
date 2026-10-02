This directory preserves the original contracts that implemented the wrapped
BTC token. These contracts are not deployed. The maintained EVM contracts are
documented in [evm-base-contracts/README.md](../evm-base-contracts/README.md).

# Installation

Node.js 22.13 or newer is required.

    npm ci

# Compilation

    npm run compile

# Testing

    npm test

# Testing Coverage

    npm run coverage

# Deployment

Compile first. Deployment is a signing-only dry run by default:

    node scripts/deployer.cjs --input-file [file] --gas-price-gwei [gwei] --rpc-url [url]

Broadcast requires the explicit `--send-tx` flag:

    node scripts/deployer.cjs --input-file [file] --gas-price-gwei [gwei] --rpc-url [url] --send-tx

