const { expectThrow, ethSendTransaction, ethGetBalance } = require("../helper.cjs");

const HasNoEtherTest = artifacts.require('WBTC');

function shouldBehaveLikeHasNoEther (accounts) {

  const amount = web3.toWei('1', 'ether');

  it('should be constructible', async function () {
    await HasNoEtherTest.new();
  });

  it('should not accept ether in constructor', async function () {
    await expectThrow(HasNoEtherTest.new({ value: amount }));
  });

  it('should not accept ether', async function () {
    const hasNoEther = await HasNoEtherTest.new();

    await expectThrow(
      ethSendTransaction({
        from: accounts[1],
        to: hasNoEther.address,
        value: amount,
      }),
    );
  });
};

module.exports = { shouldBehaveLikeHasNoEther };
