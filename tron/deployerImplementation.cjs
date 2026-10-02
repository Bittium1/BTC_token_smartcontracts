const fs = require("node:fs");
const path = require("node:path");
const { TronWeb } = require("tronweb");

const CONTRACT_SEQUENCE = ["Controller", "Members", "Factory"];
const TOKEN_NAMES = new Set(["WBTC", "WETH"]);

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

function normalizeAddress(address, name) {
  if (typeof address !== "string" || !TronWeb.isAddress(address)) {
    throw new Error(`${name} must be a valid Tron address`);
  }
  return address.startsWith("41") ? TronWeb.address.fromHex(address) : address;
}

function loadDeploymentConfig(inputFile) {
  const config = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const forbiddenFields = ["privateKey", "privateKeyCustodian", "privateKeyMerchant"];
  if (forbiddenFields.some(field => field in config)) {
    throw new Error("Deployment config must not contain private keys");
  }

  return {
    custodianAddress: normalizeAddress(config.custodianAddress, "custodianAddress"),
    merchantAddress: normalizeAddress(config.merchantAddress, "merchantAddress"),
    multiSigAddress: normalizeAddress(config.multiSigAddress, "multiSigAddress"),
  };
}

function artifactFiles(directory, contractName) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return artifactFiles(entryPath, contractName);
    if (entry.isFile() && entry.name === `${contractName}.json` && !entry.name.endsWith(".dbg.json")) {
      return [entryPath];
    }
    return [];
  });
}

function loadArtifact(artifactsDir, contractName) {
  const matches = artifactFiles(artifactsDir, contractName);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one deployment artifact for ${contractName}, found ${matches.length}`);
  }

  const artifact = JSON.parse(fs.readFileSync(matches[0], "utf8"));
  const abi = typeof artifact.abi === "string" ? JSON.parse(artifact.abi) : artifact.abi;
  const bytecodeValue = artifact.bytecode ?? artifact.evm?.bytecode?.object;
  const bytecode = typeof bytecodeValue === "string" ? bytecodeValue.replace(/^0x/, "") : "";

  if (!Array.isArray(abi) || !/^[0-9a-f]+$/i.test(bytecode)) {
    throw new Error(`Deployment artifact for ${contractName} must contain an ABI and bytecode`);
  }

  return {abi, bytecode};
}

function validateOptions(feeLimit, energyLimit, userFeePercentage, rpcUrl, tokenName) {
  assertPositiveInteger(feeLimit, "feeLimit");
  assertPositiveInteger(energyLimit, "energyLimit");
  if (!Number.isInteger(userFeePercentage) || userFeePercentage < 1 || userFeePercentage > 99) {
    throw new Error("userFeePercentage must be an integer between 1 and 99");
  }

  const parsedRpcUrl = new URL(rpcUrl);
  if (!["http:", "https:"].includes(parsedRpcUrl.protocol)) {
    throw new Error("rpcUrl must use HTTP or HTTPS");
  }
  if (!TOKEN_NAMES.has(tokenName)) {
    throw new Error("tokenName must be WBTC or WETH");
  }
}

module.exports.deploy = async function (
  inputFile,
  feeLimit,
  energyLimit,
  userFeePercentage,
  rpcUrl,
  dontSendTx,
  tokenName,
  artifactsDir = path.join(process.cwd(), "build", "contracts"),
) {
  validateOptions(feeLimit, energyLimit, userFeePercentage, rpcUrl, tokenName);
  const config = loadDeploymentConfig(inputFile);
  const contractNames = [tokenName, ...CONTRACT_SEQUENCE];
  const artifacts = new Map(
    contractNames.map(contractName => [contractName, loadArtifact(artifactsDir, contractName)]),
  );
  const plan = {broadcast: !dontSendTx, tokenName, contracts: contractNames};

  if (dontSendTx) {
    console.log(`Validated non-broadcast ${tokenName} deployment plan (${contractNames.length} contracts).`);
    return plan;
  }

  const privateKey = process.env.TRON_PRIVATE_KEY;
  if (typeof privateKey !== "string" || privateKey.length === 0) {
    throw new Error("TRON_PRIVATE_KEY is required only when --send-tx is used");
  }

  const tronWeb = new TronWeb({fullHost: rpcUrl, privateKey});
  const sender = tronWeb.address.fromPrivateKey(privateKey);
  if (!sender) throw new Error("TRON_PRIVATE_KEY is invalid");

  const deployContract = async (contractName, parameters) => {
    const artifact = artifacts.get(contractName);
    const contract = await tronWeb.contract().new({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      feeLimit,
      callValue: 0,
      userFeePercentage,
      originEnergyLimit: energyLimit,
      parameters,
    });
    const address = contract.address.startsWith("41")
      ? TronWeb.address.fromHex(contract.address)
      : contract.address;
    return {address, contract};
  };

  const token = await deployContract(tokenName, []);
  const controller = await deployContract("Controller", [token.address]);
  const members = await deployContract("Members", [sender]);
  const factory = await deployContract("Factory", [controller.address]);

  const transactions = [];
  transactions.push(await controller.contract.setFactory(factory.address).send());
  transactions.push(await controller.contract.setMembers(members.address).send());
  transactions.push(await token.contract.transferOwnership(controller.address).send());
  transactions.push(await controller.contract.callClaimOwnership(token.address).send());
  transactions.push(await members.contract.setCustodian(config.custodianAddress).send());
  transactions.push(await members.contract.addMerchant(config.merchantAddress).send());
  transactions.push(await controller.contract.transferOwnership(config.multiSigAddress).send());
  transactions.push(await members.contract.transferOwnership(config.multiSigAddress).send());

  return {
    ...plan,
    addresses: {
      token: token.address,
      controller: controller.address,
      members: members.address,
      factory: factory.address,
    },
    transactions,
  };
};

module.exports.loadArtifact = loadArtifact;
module.exports.loadDeploymentConfig = loadDeploymentConfig;
