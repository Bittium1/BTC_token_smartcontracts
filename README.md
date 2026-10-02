# BTC Token Smart Contracts

This repository has the contracts that implement the wrapped tokens.

## EVM networks

[evm-base-contracts/README.md](evm-base-contracts/README.md)

## Tron network

[tron/README.md](tron/README.md)

## Original Ethereum network

[ethereum/README.md](ethereum/README.md)

## Verification

`Contracts CI` installs locked dependencies, compiles, tests, and audits every
module. It also verifies that the Base and Kava WBTC wrappers remain identical
to the tested canonical EVM contract and rejects tracked private-key literals.

Deployment input files are ignored. Copy the relevant
`deployerInput.example.json` file locally and populate it outside version
control; tests derive disposable accounts in memory from Hardhat's public test
mnemonic.
