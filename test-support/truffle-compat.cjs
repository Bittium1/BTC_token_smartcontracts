const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
const BigNumber = projectRequire("bignumber.js");
const { HDNodeWallet } = projectRequire("ethers");
const { utils: web3Utils } = projectRequire("web3");

const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const TEST_WALLETS = Array.from({ length: 20 }, (_, index) =>
  HDNodeWallet.fromPhrase(
    TEST_MNEMONIC,
    undefined,
    `m/44'/60'/0'/0/${index}`,
  ),
);
const TEST_ACCOUNTS = TEST_WALLETS.map((wallet) => wallet.address);

function getTestDeployerInput() {
  return {
    privateKey: TEST_WALLETS[1].privateKey,
    privateKeyCustodian: TEST_WALLETS[2].privateKey,
    privateKeyMerchant: TEST_WALLETS[3].privateKey,
    accountMultiSigAddress: TEST_WALLETS[4].address,
  };
}

let runtimePromise;

async function getRuntime() {
  if (runtimePromise === undefined) {
    runtimePromise = (async () => {
      // This helper sits above each package, so resolve Hardhat from the active project.
      const hardhatEntryPoint = projectRequire.resolve("hardhat");
      const { network } = await import(pathToFileURL(hardhatEntryPoint).href);
      const connection = await network.create("hardhatMainnet");
      const signers = await connection.ethers.getSigners();
      const actualAccounts = await Promise.all(
        signers.map((signer) => signer.getAddress()),
      );

      for (let index = 0; index < TEST_ACCOUNTS.length; index += 1) {
        if (actualAccounts[index].toLowerCase() !== TEST_ACCOUNTS[index].toLowerCase()) {
          throw new Error("Hardhat test account configuration does not match the compatibility layer");
        }
      }

      const signersByAddress = new Map(
        actualAccounts.map((address, index) => [address.toLowerCase(), signers[index]]),
      );

      return { connection, ethers: connection.ethers, signers, signersByAddress };
    })();
  }

  return runtimePromise;
}

function artifactFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return artifactFiles(entryPath);
    }
    if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith(".dbg.json")) {
      return [entryPath];
    }
    return [];
  });
}

function loadArtifact(contractName) {
  const matches = artifactFiles(path.join(process.cwd(), "artifacts", "contracts"))
    .map((artifactPath) => ({
      artifactPath,
      artifact: JSON.parse(fs.readFileSync(artifactPath, "utf8")),
    }))
    .filter(({ artifact }) => artifact.contractName === contractName);

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Hardhat artifact for ${contractName}, found ${matches.length}`,
    );
  }

  return matches[0].artifact;
}

function contractNameFromReference(reference) {
  return path.basename(reference).replace(/\.sol$/i, "");
}

function isTransactionOptions(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return ["from", "value", "gas", "gasLimit", "gasPrice"].some((key) => key in value);
}

function splitOptions(inputArguments) {
  const args = [...inputArguments];
  const options = isTransactionOptions(args.at(-1)) ? args.pop() : {};
  return { args, options };
}

function ethersOverrides(options) {
  const overrides = {};
  if (options.value !== undefined) overrides.value = options.value;
  if (options.gas !== undefined) overrides.gasLimit = options.gas;
  if (options.gasLimit !== undefined) overrides.gasLimit = options.gasLimit;
  if (options.gasPrice !== undefined) overrides.gasPrice = options.gasPrice;
  return overrides;
}

async function signerFor(options, runtime) {
  if (options.from === undefined) {
    return runtime.signers[0];
  }

  const signer = runtime.signersByAddress.get(options.from.toLowerCase());
  if (signer === undefined) {
    throw new Error(`No unlocked Hardhat signer for ${options.from}`);
  }
  return signer;
}

function decodedLogs(receipt, contractInterface) {
  return receipt.logs.flatMap((log) => {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed !== null) {
        const args = {};
        parsed.fragment.inputs.forEach((input, index) => {
          args[index] = parsed.args[index];
          if (input.name !== "") args[input.name] = parsed.args[index];
        });
        return [{ event: parsed.name, args, address: log.address }];
      }
    } catch {
      // Truffle only exposes logs that can be decoded by the called contract's ABI.
    }
    return [];
  });
}

function normalizedArguments(fragment, args) {
  return args.map((argument, index) => {
    const inputType = fragment.inputs[index]?.type ?? "";
    if (inputType === "address" && (argument === 0 || argument === null)) {
      return "0x0000000000000000000000000000000000000000";
    }

    const fixedBytes = /^bytes(\d+)$/.exec(inputType);
    if (fixedBytes !== null && argument === 0) {
      return `0x${"0".repeat(Number(fixedBytes[1]) * 2)}`;
    }
    if (fixedBytes === null || typeof argument !== "string" || !/^0x[0-9a-f]*$/i.test(argument)) {
      return argument;
    }

    const byteLength = Number(fixedBytes[1]);
    const hexLength = byteLength * 2;
    const value = argument.slice(2);
    return value.length < hexLength ? `0x${value}${"0".repeat(hexLength - value.length)}` : argument;
  });
}

async function transactionResult(transactionResponse, contractInterface) {
  const receipt = await transactionResponse.wait();
  return {
    tx: transactionResponse.hash,
    receipt,
    logs: decodedLogs(receipt, contractInterface),
  };
}

function wrapContract(contract) {
  return new Proxy(contract, {
    get(target, property, receiver) {
      if (property === "address") return target.target;
      if (property === "then") return undefined;
      if (typeof property !== "string") return Reflect.get(target, property, receiver);

      let fragment;
      try {
        fragment = target.interface.getFunction(property);
      } catch {
        return Reflect.get(target, property, receiver);
      }

      if (fragment === null) return Reflect.get(target, property, receiver);

      const invoke = async (forceStatic, inputArguments) => {
        const runtime = await getRuntime();
        const { args, options } = splitOptions(inputArguments);
        const signer = await signerFor(options, runtime);
        const connected = target.connect(signer);
        const contractMethod = connected.getFunction(fragment.name);
        const overrides = ethersOverrides(options);
        const normalizedArgs = normalizedArguments(fragment, args);
        const callArgs = Object.keys(overrides).length === 0
          ? normalizedArgs
          : [...normalizedArgs, overrides];
        const readOnly = fragment.stateMutability === "view" || fragment.stateMutability === "pure";

        if (forceStatic || readOnly) {
          return contractMethod.staticCall(...callArgs);
        }

        return transactionResult(await contractMethod(...callArgs), target.interface);
      };

      const method = (...args) => invoke(false, args);
      method.call = (...args) => invoke(true, args);
      return method;
    },
  });
}

function truffleArtifact(reference) {
  const contractName = contractNameFromReference(reference);
  return {
    async new(...inputArguments) {
      const runtime = await getRuntime();
      const artifact = loadArtifact(contractName);
      const { args, options } = splitOptions(inputArguments);
      const signer = await signerFor(options, runtime);
      const factory = await runtime.ethers.getContractFactory(
        artifact.abi,
        artifact.bytecode,
        signer,
      );
      const overrides = ethersOverrides(options);
      const normalizedArgs = normalizedArguments(factory.interface.deploy, args);
      const deployArgs = Object.keys(overrides).length === 0
        ? normalizedArgs
        : [...normalizedArgs, overrides];
      const contract = await factory.deploy(...deployArgs);
      const deploymentTransaction = contract.deploymentTransaction();
      if (deploymentTransaction !== null) {
        await deploymentTransaction.wait();
      }
      await contract.waitForDeployment();
      return wrapContract(contract);
    },
  };
}

const currentProvider = {
  async request(payload) {
    const { connection } = await getRuntime();
    return connection.provider.request(payload);
  },
  async send(payload, callback) {
    try {
      const result = await this.request(payload);
      if (typeof callback === "function") callback(null, { jsonrpc: "2.0", id: payload.id, result });
      return result;
    } catch (error) {
      if (typeof callback === "function") callback(error);
      else throw error;
    }
  },
};

global.assert = projectRequire("chai").assert;
global.contract = (name, tests) => describe(name, () => tests(TEST_ACCOUNTS));
global.artifacts = { require: truffleArtifact };
global.web3 = {
  BigNumber,
  currentProvider,
  toWei: web3Utils.toWei,
  utils: web3Utils,
};

module.exports = { getRuntime, getTestDeployerInput, TEST_ACCOUNTS };
