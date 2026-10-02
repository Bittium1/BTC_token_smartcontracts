const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

function readNormalized(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

const canonical = readNormalized("evm-base-contracts/contracts/token/WBTC.sol");
const expectedWrapper = canonical.replace(
  'import "../token/WrappedToken.sol";',
  'import "../evm-base-contracts/contracts/token/WrappedToken.sol";',
);

if (expectedWrapper === canonical) {
  throw new Error("Canonical WBTC import was not found");
}

for (const chain of ["base", "kava"]) {
  const wrapper = readNormalized(`${chain}/WBTC.sol`);
  if (wrapper !== expectedWrapper) {
    throw new Error(`${chain}/WBTC.sol differs from the tested canonical WBTC contract`);
  }
}

console.log("Base and Kava WBTC wrappers match the tested canonical contract.");
