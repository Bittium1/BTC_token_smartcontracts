module.exports.deploy = async function (inputFile, gasPriceGwei, rpcUrl, dontSendTx, tokenName, skipAddMembers = false) {

    const { Web3 } = require("web3");
    const fs = require("fs");
    const path = require('path');
    const RLP = require('rlp');
    const BigNumber = require('bignumber.js')

    const provider = typeof rpcUrl === "string"
        ? new Web3.providers.HttpProvider(rpcUrl)
        : rpcUrl;
    const web3 = new Web3(provider);
    const gasPrice = BigNumber(gasPriceGwei).times(10 ** 9).toFixed(0);
    const signedTxs = [];
    let chainId;

    let nonce;
    let privateKey, account, sender;
    let privateKeyCustodian, accountCustodian, accountCustodianAddress;
    let privateKeyMerchant, accountMerchant, accountMerchantAddress;
    let accountMultiSigAddress;

    function loadArtifact(contractName) {
        const artifactRoot = path.join(__dirname, "artifacts", "contracts");
        const findArtifact = directory => {
            if (!fs.existsSync(directory)) return null;
            for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
                const entryPath = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    const nested = findArtifact(entryPath);
                    if (nested) return nested;
                } else if (entry.name === contractName + ".json" && !entry.name.endsWith(".dbg.json")) {
                    return entryPath;
                }
            }
            return null;
        };
        const artifactPath = findArtifact(artifactRoot);
        if (artifactPath === null) {
            throw new Error("Missing compiled artifact for " + contractName + ". Run `npm run compile` first.");
        }

        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        if (!artifact.bytecode || artifact.bytecode === "0x") {
            throw new Error("Compiled artifact for " + contractName + " has no deployable bytecode.");
        }

        return artifact;
    }

    function sleep(ms){
        return new Promise(resolve=>{
            setTimeout(resolve,ms)
        })
    }

    function getKeyAndAccounts() {

        let content = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        const normalizePrivateKey = (value, fieldName) => {
            const hex = typeof value === "string" ? value.replace(/^0x/, "") : "";
            if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length > 64) {
                throw new Error(fieldName + " must contain at most 32 bytes of hexadecimal data");
            }
            return "0x" + hex.padStart(64, "0");
        };

        privateKey = normalizePrivateKey(content["privateKey"], "privateKey")
        privateKeyCustodian = normalizePrivateKey(content["privateKeyCustodian"], "privateKeyCustodian")
        privateKeyMerchant = normalizePrivateKey(content["privateKeyMerchant"], "privateKeyMerchant")
        accountMultiSigAddress = content["accountMultiSigAddress"]

        account = web3.eth.accounts.privateKeyToAccount(privateKey);
        sender = account.address;
        console.log("from",sender);

        accountCustodian = web3.eth.accounts.privateKeyToAccount(privateKeyCustodian);
        accountCustodianAddress = accountCustodian.address;
        console.log("accountCustodianAddress", accountCustodianAddress);

        accountMerchant = web3.eth.accounts.privateKeyToAccount(privateKeyMerchant);
        accountMerchantAddress = accountMerchant.address;
        console.log("accountMerchantAddress", accountMerchantAddress);

        console.log("accountMultiSigAddress", accountMultiSigAddress);
    }

    async function sendTx(txObject, fromAccount) {
        const isDeployment = "deployData" in txObject;
        const populatedTx = !isDeployment && typeof txObject.populateTransaction === "function"
            ? await txObject.populateTransaction({from: fromAccount.address})
            : null;
        const txTo = populatedTx?.to ?? null;

        let gasLimit;
        try {
            gasLimit = Number(await txObject.estimateGas());
        }
        catch (e) {
            gasLimit = 500 * 1000;
        }

        if(txTo !== null) {
            gasLimit = 500 * 1000;
        }

        gasLimit *= 1.2;
        gasLimit -= gasLimit % 1;

        const txData = populatedTx?.data ?? txObject.encodeABI();
        const txFrom = fromAccount.address;
        const txKey = fromAccount.privateKey;

        const tx = {
            from : txFrom,
            to : txTo,
            nonce : nonce,
            data : txData,
            gas : gasLimit,
            chainId,
            gasPrice
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
        nonce++;
        signedTxs.push(signedTx.rawTransaction)
        if (dontSendTx) return null;

        // Wait for the receipt so dependent transactions cannot overtake deployment.
        return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    }

    async function deployContract(contractName, ctorArgs) {
        const artifact = loadArtifact(contractName);
        const myContract = new web3.eth.Contract(artifact.abi);
        const deploy = myContract.deploy({data: artifact.bytecode, arguments: ctorArgs});

        let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
        address = web3.utils.toChecksumAddress(address);

        const receipt = await sendTx(deploy, account);
        if (receipt && receipt.contractAddress) {
            address = receipt.contractAddress;
        }

        myContract.options.address = address;

        return [address, myContract];
    }

    async function waitForEth(address) {
        while(true) {
            const balance = await web3.eth.getBalance(address);
            console.log("waiting for balance to account " + address);
            if(balance.toString() !== "0") {
                console.log("received " + balance.toString() + " wei");
                return;
            }
            else await sleep(10000)
        }
    }

    async function fundTestRpcAccounts() {
        const accounts = await web3.eth.getAccounts();
        const amount = BigNumber(1).times(10 ** 18).toFixed(0) // 1 eth
        await web3.eth.sendTransaction({to: sender, from: accounts[0], value: amount, gasPrice});
        await web3.eth.sendTransaction({to: accountCustodianAddress, from: accounts[0], value: amount, gasPrice});
        await web3.eth.sendTransaction({to: accountMerchantAddress, from: accounts[0], value: amount, gasPrice});
    }

    async function main() {

        getKeyAndAccounts();

        /////////////////////////////////////////////////////////////
        const networkChainId = Number(await web3.eth.getChainId());
        const isLocalDevelopmentNetwork = [1337, 5777, 31337].includes(networkChainId);
        if (isLocalDevelopmentNetwork && !dontSendTx) {
            await fundTestRpcAccounts();
        }

        /////////////////////////////////////////////////////////////

        nonce = await web3.eth.getTransactionCount(sender);
        console.log("nonce",nonce);

        chainId = networkChainId;
        console.log('chainId', chainId);

        if (!dontSendTx) {
            await waitForEth(sender);
            await waitForEth(accountCustodianAddress);
            await waitForEth(accountMerchantAddress);
        }

        /////////////////////////////////////////////////////////////

        let tokenAddress, tokenContract;
        [tokenAddress, tokenContract] = await deployContract(tokenName, []);
        console.log("tokenAddress: " + tokenAddress);

        let controllerAddress, controllerContract;
        [controllerAddress, controllerContract] = await deployContract("Controller", [tokenAddress]);
        console.log("controllerAddress: " + controllerAddress)

        let membersAddress, membersContract;
        // set sender as owner here, can use controller in final deployment.
        [membersAddress, membersContract] = await deployContract("Members", [sender]);
        console.log("membersAddress: " + membersAddress)

        let factoryAddress, factoryContract;
        [factoryAddress, factoryContract] = await deployContract("Factory", [controllerAddress]);
        console.log("factoryAddress: " + factoryAddress)

        ////////////////////////////////////////////////////////////

        console.log("controllerContract.methods.setFactory: " + factoryAddress)
        await sendTx(controllerContract.methods.setFactory(factoryAddress), account);

        console.log("controllerContract.methods.setMembers: " + membersAddress)
        await sendTx(controllerContract.methods.setMembers(membersAddress), account);

        ////////////////////////////////////////////////////////////

        console.log("tokenContract.methods.transferOwnership: " + controllerAddress)
        await sendTx(tokenContract.methods.transferOwnership(controllerAddress), account);

        console.log("controllerContract.methods.callClaimOwnership: " + tokenAddress)
        await sendTx(controllerContract.methods.callClaimOwnership(tokenAddress), account);

        ////////////////////////////////////////////////////////////

        if (!skipAddMembers) {
          console.log(
            "membersContract.methods.setCustodian: " + accountCustodianAddress
          );
          await sendTx(
            membersContract.methods.setCustodian(accountCustodianAddress),
            account
          );

          console.log(
            "membersContract.methods.addMerchant: " + accountMerchantAddress
          );
          await sendTx(
            membersContract.methods.addMerchant(accountMerchantAddress),
            account
          );
        }

        ////////////////////////////////////////////////////////////

        console.log("controllerContract.methods.transferOwnership: " + accountMultiSigAddress)
        await sendTx(controllerContract.methods.transferOwnership(accountMultiSigAddress), account);

        console.log("membersContract.methods.transferOwnership: " + accountMultiSigAddress)
        await sendTx(membersContract.methods.transferOwnership(accountMultiSigAddress), account);

        ////////////////////////////////////////////////////////////

        if (!skipAddMembers) {
          nonce = await web3.eth.getTransactionCount(accountCustodianAddress);
          console.log("accountCustodianAddress nonce: " + nonce);
          let custodianDepositAddress = "1JPhiNBhZzBgWwjG6zaDchmXZyTyUN5Qny";
          console.log(
            "factoryContract.methods.setCustodianDepositAddress: " +
              accountMerchantAddress +
              ", " +
              custodianDepositAddress
          );
          await sendTx(
            factoryContract.methods.setCustodianDepositAddress(
              accountMerchantAddress,
              custodianDepositAddress
            ),
            accountCustodian
          );

          nonce = await web3.eth.getTransactionCount(accountMerchantAddress);
          console.log("accountMerchantAddress nonce: " + nonce);
          let merchantDepositAddress = "1E57B5SCkGVhFxDugko3quHxamPgkS8NxJ";
          console.log(
            "factoryContract.methods.setMerchantDepositAddress: " +
              merchantDepositAddress
          );
          await sendTx(
            factoryContract.methods.setMerchantDepositAddress(
              merchantDepositAddress
            ),
            accountMerchant
          );
        }

        nonce = await web3.eth.getTransactionCount(sender);

        ////////////////////////////////////////////////////////////

        console.log("last nonce is", nonce);

        ////////////////////////////////////////////////////////////

        console.log("next step: multisig should claim ownership for controller and members.")
    }

    await main();
};

if (process.argv.length < 3) {
    console.log("usage: node deployerImplementation.cjs <tokenName>");
}
