const {
    getTestDeployerInput,
    requireProjectDependency,
} = require("../../test-support/truffle-compat.cjs");
const deployer = require("../deployerImplementation.cjs");

requireProjectDependency("chai")
    .use(requireProjectDependency("chai-as-promised"))
    .should()

contract('Deployer', function(accounts) {

    it("test WBTC deployer script on private net.", async function () {
        await deployer.deploy(getTestDeployerInput(), 20, web3.currentProvider, false, "WBTC");
    });

    it("test WXRP deployer script on private net.", async function () {
        await deployer.deploy(getTestDeployerInput(), 20, web3.currentProvider, false, "WXRP");
    });
});
