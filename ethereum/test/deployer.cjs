const { getTestDeployerInput } = require("../../test-support/truffle-compat.cjs");
const deployer = require("../scripts/deployerImplementation.cjs");

require("chai")
    .use(require("chai-as-promised"))
    .should()

contract('Deployer', function(accounts) {

    it("test deployer script on private net.", async function () {
        await deployer.deploy(getTestDeployerInput(), 20, web3.currentProvider, false);
    });
});
