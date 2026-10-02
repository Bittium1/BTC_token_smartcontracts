const { getRuntime } = require("../test-support/truffle-compat.cjs");

async function expectThrow(promise, message) {
  try {
    await promise;
  } catch (error) {
    if (message !== undefined) {
      assert.include(error.message, message);
    } else {
      assert.match(error.message, /invalid opcode|out of gas|revert/i);
    }
    return;
  }
  assert.fail("Expected throw not received");
}

async function assertRevert(promise) {
  try {
    await promise;
  } catch (error) {
    assert.match(error.message, /revert/i);
    return;
  }
  assert.fail("Expected revert not received");
}

async function inLogs(logs, eventName, eventArgs = {}) {
  const event = logs.find((entry) => entry.event === eventName);
  assert.exists(event);
  for (const [name, value] of Object.entries(eventArgs)) {
    assert.exists(event.args[name]);
    assert.equal(event.args[name], value);
  }
  return event;
}

async function ethSendTransaction({ from, to, value, data }) {
  const runtime = await getRuntime();
  const signer = runtime.signersByAddress.get(from.toLowerCase());
  if (signer === undefined) throw new Error(`No unlocked Hardhat signer for ${from}`);
  const transaction = await signer.sendTransaction({ to, value, data });
  return transaction.wait();
}

async function ethGetBalance(address) {
  const { ethers } = await getRuntime();
  return ethers.provider.getBalance(address);
}

module.exports = {
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
  ZERO_BYTES32: `0x${"0".repeat(64)}`,
  UNKNOWN_BYTES32: `0x${"1".repeat(64)}`,
  EVMRevert: "revert",
  assertRevert,
  ethGetBalance,
  ethSendTransaction,
  expectThrow,
  inLogs,
};
