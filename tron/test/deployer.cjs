const path = require("node:path");
const deployer = require("../deployerImplementation.cjs");

const inputFile = path.join(__dirname, "..", "deployerInput.example.json");
const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");

describe("Tron deployer", function () {
  for (const tokenName of ["WBTC", "WETH"]) {
    it(`builds a non-broadcast ${tokenName} deployment plan`, async function () {
      const plan = await deployer.deploy(
        inputFile,
        1_000_000_000,
        10_000_000,
        30,
        "https://example.invalid",
        true,
        tokenName,
        artifactsDir,
      );

      assert.isFalse(plan.broadcast);
      assert.deepEqual(plan.contracts, [tokenName, "Controller", "Members", "Factory"]);
    });
  }
});
