const { ZERO_ADDRESS, assertRevert, inLogs } = require("../helper.cjs");

require('chai').should();

function shouldBehaveLikeBurnableToken ([owner, anotherAccount], initialBalance) {
  describe('as a basic burnable token', function () {
    describe('when the sender is the token owner', function () {

      const from = owner;

      describe('when the given amount is not greater than balance of the sender', function () {
        const amount = 100;

        beforeEach(async function () {
          ({ logs: this.logs } = await this.token.burn(amount, { from }));
        });

        it('burns the requested amount', async function () {
          const balance = await this.token.balanceOf(from);
          assert.equal(balance.toString(), String(initialBalance - amount));
        });

        it('emits a burn event', async function () {
          const event = await inLogs(this.logs, 'Burn');
          event.args.burner.should.eq(owner);
          assert.equal(event.args.value.toString(), String(amount));
        });

        it('emits a transfer event', async function () {
          const event = await inLogs(this.logs, 'Transfer');
          event.args.from.should.eq(owner);
          event.args.to.should.eq(ZERO_ADDRESS);
          assert.equal(event.args.value.toString(), String(amount));
        });
      });

      describe('when the given amount is greater than the balance of the sender', function () {
        const amount = initialBalance + 1;

        it('reverts', async function () {
          await assertRevert(this.token.burn(amount, { from }));
        });
      });
    });

    describe('when the sender is not the token owner', function () {
      const from = anotherAccount;
      const amount = 100;

      it('reverts', async function () {
        await assertRevert(this.token.burn(amount, { from }));
      });
    });
  });
}

module.exports = {
  shouldBehaveLikeBurnableToken,
};
