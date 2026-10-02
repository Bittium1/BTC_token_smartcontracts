module.exports.deploy = async function (inputFile, gasPriceGwei, rpcUrl, dontSendTx) {
    const { Web3 } = require("web3");
    const fs = require("fs");
    const path = require("path");
    const RLP = require("rlp");
    const BigNumber = require("bignumber.js");

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
        const artifactRoot = path.join(__dirname, "..", "artifacts", "contracts");
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

    function sleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    function getKeyAndAccounts() {
        const content = typeof inputFile === "string"
            ? JSON.parse(fs.readFileSync(inputFile, "utf8"))
            : inputFile;
        if (content === null || typeof content !== "object") {
            throw new Error("Deployment input must be a file path or configuration object");
        }
        const normalizePrivateKey = (value, fieldName) => {
            const hex = typeof value === "string" ? value.replace(/^0x/, "") : "";
            if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length > 64) {
                throw new Error(fieldName + " must contain at most 32 bytes of hexadecimal data");
            }
            return "0x" + hex.padStart(64, "0");
        };

        privateKey = normalizePrivateKey(content["privateKey"], "privateKey");
        privateKeyCustodian = normalizePrivateKey(content["privateKeyCustodian"], "privateKeyCustodian");
        privateKeyMerchant = normalizePrivateKey(content["privateKeyMerchant"], "privateKeyMerchant");
        accountMultiSigAddress = content["accountMultiSigAddress"];

        account = web3.eth.accounts.privateKeyToAccount(privateKey);
        sender = account.address;
        console.log("from", sender);

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
        } catch (error) {
            gasLimit = 500 * 1000;
        }

        if (txTo !== null) gasLimit = 500 * 1000;
        gasLimit *= 1.2;
        gasLimit -= gasLimit % 1;

        const tx = {
            from: fromAccount.address,
            to: txTo,
            nonce,
            data: populatedTx?.data ?? txObject.encodeABI(),
            gas: gasLimit,
            chainId,
            gasPrice
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, fromAccount.privateKey);
        nonce++;
        signedTxs.push(signedTx.rawTransaction);
        if (dontSendTx) return null;

        // Wait for the receipt so dependent transactions cannot overtake deployment.
        return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    }

    async function deployContract(contractName, ctorArgs) {
        const artifact = loadArtifact(contractName);
        const myContract = new web3.eth.Contract(artifact.abi);
        const deploy = myContract.deploy({data: artifact.bytecode, arguments: ctorArgs});

        let address = "0x" + web3.utils.sha3(RLP.encode([sender, nonce])).slice(12).substring(14);
        address = web3.utils.toChecksumAddress(address);

        const receipt = await sendTx(deploy, account);
        if (receipt && receipt.contractAddress) address = receipt.contractAddress;

        myContract.options.address = address;
        return [address, myContract];
    }

    async function waitForEth(address) {
        while (true) {
            const balance = await web3.eth.getBalance(address);
            console.log("waiting for balance to account " + address);
            if (balance.toString() !== "0") {
                console.log("received " + balance.toString() + " wei");
                return;
            }
            await sleep(10000);
        }
    }

    async function fundTestRpcAccounts() {
        const accounts = await web3.eth.getAccounts();
        const amount = BigNumber(1).times(10 ** 18).toFixed(0);
        await web3.eth.sendTransaction({to: sender, from: accounts[0], value: amount, gasPrice});
        await web3.eth.sendTransaction({to: accountCustodianAddress, from: accounts[0], value: amount, gasPrice});
        await web3.eth.sendTransaction({to: accountMerchantAddress, from: accounts[0], value: amount, gasPrice});
    }

    async function main() {
        getKeyAndAccounts();

        const networkChainId = Number(await web3.eth.getChainId());
        const isLocalDevelopmentNetwork = [1337, 5777, 31337].includes(networkChainId);
        if (isLocalDevelopmentNetwork && !dontSendTx) await fundTestRpcAccounts();

        nonce = await web3.eth.getTransactionCount(sender);
        console.log("nonce", nonce);

        chainId = networkChainId;
        console.log("chainId", chainId);

        if (!dontSendTx) {
            await waitForEth(sender);
            await waitForEth(accountCustodianAddress);
            await waitForEth(accountMerchantAddress);
        }

        let tokenAddress, tokenContract;
        [tokenAddress, tokenContract] = await deployContract("WBTC", []);
        console.log("tokenAddress: " + tokenAddress);

        let controllerAddress, controllerContract;
        [controllerAddress, controllerContract] = await deployContract("Controller", [tokenAddress]);
        console.log("controllerAddress: " + controllerAddress);

        let membersAddress, membersContract;
        [membersAddress, membersContract] = await deployContract("Members", [sender]);
        console.log("membersAddress: " + membersAddress);

        let factoryAddress, factoryContract;
        [factoryAddress, factoryContract] = await deployContract("Factory", [controllerAddress]);
        console.log("factoryAddress: " + factoryAddress);

        console.log("controllerContract.methods.setFactory: " + factoryAddress);
        await sendTx(controllerContract.methods.setFactory(factoryAddress), account);
        console.log("controllerContract.methods.setMembers: " + membersAddress);
        await sendTx(controllerContract.methods.setMembers(membersAddress), account);

        console.log("tokenContract.methods.transferOwnership: " + controllerAddress);
        await sendTx(tokenContract.methods.transferOwnership(controllerAddress), account);
        console.log("controllerContract.methods.callClaimOwnership: " + tokenAddress);
        await sendTx(controllerContract.methods.callClaimOwnership(tokenAddress), account);

        console.log("membersContract.methods.setCustodian: " + accountCustodianAddress);
        await sendTx(membersContract.methods.setCustodian(accountCustodianAddress), account);
        console.log("membersContract.methods.addMerchant: " + accountMerchantAddress);
        await sendTx(membersContract.methods.addMerchant(accountMerchantAddress), account);

        console.log("controllerContract.methods.transferOwnership: " + accountMultiSigAddress);
        await sendTx(controllerContract.methods.transferOwnership(accountMultiSigAddress), account);
        console.log("membersContract.methods.transferOwnership: " + accountMultiSigAddress);
        await sendTx(membersContract.methods.transferOwnership(accountMultiSigAddress), account);

        nonce = await web3.eth.getTransactionCount(accountCustodianAddress);
        console.log("accountCustodianAddress nonce: " + nonce);
        const custodianBtcDepositAddress = "1JPhiNBhZzBgWwjG6zaDchmXZyTyUN5Qny";
        console.log("factoryContract.methods.setCustodianBtcDepositAddress: " + accountMerchantAddress + ", " + custodianBtcDepositAddress);
        await sendTx(
            factoryContract.methods.setCustodianBtcDepositAddress(accountMerchantAddress, custodianBtcDepositAddress),
            accountCustodian
        );

        nonce = await web3.eth.getTransactionCount(accountMerchantAddress);
        console.log("accountMerchantAddress nonce: " + nonce);
        const merchantBtcDepositAddress = "1E57B5SCkGVhFxDugko3quHxamPgkS8NxJ";
        console.log("factoryContract.methods.setMerchantBtcDepositAddress: " + merchantBtcDepositAddress);
        await sendTx(
            factoryContract.methods.setMerchantBtcDepositAddress(merchantBtcDepositAddress),
            accountMerchant
        );

        nonce = await web3.eth.getTransactionCount(sender);
        console.log("last nonce is", nonce);
        console.log("next step: multisig should claim ownership for controller and members.");
    }

    await main();
};
