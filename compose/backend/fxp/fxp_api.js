import fs from 'fs'

import express from 'express';
import asyncHandler from 'express-async-handler'
import sqlite3 from 'sqlite3';
import { open } from 'sqlite'

import { BigNumber, ethers, utils } from 'ethers';
import { setIntervalAsync } from 'set-interval-async';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats'
import axios from 'axios';
import morgan from 'morgan';
import currency_codes from 'currency-codes'

import LOCK_MAX_DURATION_MILLISECONDS from './global_config.js'

const ISO_4217_CURRENCY_CODES = currency_codes.codes()

const ajvOptions = {
    formats: {
        "UTC timestamp": true,
    },
    keywords: [
        "example",
    ]
}
const ajv = new Ajv2020(ajvOptions)
ajv.addFormat("ISO 4217", {
    type: "string",
    validate: (value) => ISO_4217_CURRENCY_CODES.includes(value)
})
ajv.addFormat("SHA256", {
    type: "string",
    validate: (value) => {
        const regExp = /^[a-f0-9]{64}$/gi
        return regExp.test(value.toLowerCase())
    }
})
addFormats(ajv)

const paymentLockedRequestSchema = JSON.parse(fs.readFileSync('./json-schema/locked/request-locked-schema.json', 'utf-8'))
const validatePaymentLockedRequest = ajv.compile(paymentLockedRequestSchema)

const paymentSetupRequestSchema = JSON.parse(fs.readFileSync('./json-schema/setup/request-setup-schema.json', 'utf-8'))
const validatePaymentSetupRequest = ajv.compile(paymentSetupRequestSchema)

const paymentSetupResponseSchema = JSON.parse(fs.readFileSync('./json-schema/setup/response-setup-schema.json', 'utf-8'))
const validatePaymentSetupResponse = ajv.compile(paymentSetupResponseSchema)

const paymentCompletionRequestSchema = JSON.parse(fs.readFileSync('./json-schema/completion/request-completion-schema.json', 'utf-8'))
const validatePaymentCompletionRequest = ajv.compile(paymentCompletionRequestSchema)

const paymentCompletionResponseSchema = JSON.parse(fs.readFileSync('./json-schema/completion/response-completion-schema.json', 'utf-8'))
const validatePaymentCompletionResponse = ajv.compile(paymentCompletionResponseSchema)

const bufToStr = b => b.toString('hex')

const TARGET_NOK_ALLOWANCE = BigNumber.from(100000n * 10n ** 4n);

const NOK_DECIMALS = 4;
const HTLC_CONTRACT_ADDRESS = process.env.HTLC_CONTRACT_ADDRESS
const NOK_CONTRACT_ADDRESS = "0x6749374B18A571193138251EB52f7a9B4fC5524e";

const HTLC_ABI = JSON.parse(fs.readFileSync('./abi/HashedTimeLockERC20.json', 'utf-8'))
const CB_TOKEN_ABI = JSON.parse(fs.readFileSync('./abi/CBToken.json', 'utf-8'))

const FXP_ID = process.env.FXP_ID.toLowerCase()
const WALLET_FILE = fs.readFileSync(`./wallets/${FXP_ID}.json`)

const HUB_URL = (process.env.HUB_URL ?? "http://localhost:8080")
const PAYMENT_COMPLETION_PATH = "/payment/completion"
const PAYMENT_SETUP_PATH = "/payment/setup"

const PVPVP_INTERMEDIATE_LOCK_DELAY_SECONDS = 60
const PVPVP_INTERMEDIATE_LOCK_NETWORK_DELAY_SECONDS = 5

const FXP_BASE_URL = process.env.FXP_BASE_URL
const HUB_REQUEST_HEADER_VALUE = process.env.HUB_REQUEST_HEADER

const OPEN_STATUS = "OPEN"
const WITHDRAWN_STATUS = "WITHDRAWN"

let TX_OVERRIDES = {
    gasPrice: 0
};

const readSecret = (secretName) => {
    console.log("Secret with key: " + secretName + " requested ")
    try {
        const loadedSecret = fs.readFileSync(`/run/secrets/${secretName}`, 'utf-8');
        return loadedSecret.trim()
    } catch(err) {
        console.error(`failed to read secret ${secretName}. Error: ${err}`)
        throw new Error(err)
    }
}

const JSON_RPC_PROVIDER_URL = process.env.JSON_RPC_PROVIDER_URL
const jsonRPCProvider = new ethers.providers.JsonRpcProvider(
    {
        url: JSON_RPC_PROVIDER_URL,
        user: readSecret('rpc_user'),
        password: readSecret('rpc_password'),
        allowInsecureAuthentication: true
    }
)

const fxpWallet = ethers.Wallet.fromEncryptedJsonSync(
    WALLET_FILE, 
    readSecret(`${FXP_ID.toLowerCase()}_wallet_password`)
).connect(jsonRPCProvider)

const nokContract = new ethers.Contract(NOK_CONTRACT_ADDRESS, CB_TOKEN_ABI, jsonRPCProvider).connect(fxpWallet)
const htlcContract = new ethers.Contract(HTLC_CONTRACT_ADDRESS, HTLC_ABI, jsonRPCProvider).connect(fxpWallet)

const DB = await open({
    filename: `./db/${FXP_ID}.db`,
    driver: sqlite3.Database
})

await DB.exec(`
    CREATE TABLE IF NOT EXISTS FXP_DATA_EMMA 
    (
        hash TEXT NOT NULL, 
        paymentId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        targetWallet TEXT NOT NULL, 
        lockContract TEXT NOT NULL PRIMARY KEY,
        paymentInstructionJson TEXT NOT NULL,
        secret TEXT
    )
`)

await DB.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS paymentId_unique_emma 
    ON FXP_DATA_EMMA(paymentId);
`)

await DB.exec(`
CREATE TABLE IF NOT EXISTS FXP_DATA_BENNY 
(
    hash TEXT NOT NULL, 
    paymentId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    targetWallet TEXT NOT NULL, 
    lockContract TEXT NOT NULL PRIMARY KEY,
    paymentInstructionJson TEXT NOT NULL,
    status TEXT NOT NULL,
    secret TEXT
)
`)

await DB.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS paymentId_unique_benny 
    ON FXP_DATA_BENNY(paymentId);
`)

const isPVPVP = (paymentInstruction) => {
    return (
        "intermediateCurrency" in paymentInstruction &&
        "intermediateAmount" in paymentInstruction &&
        "intermediateSenderFx" in paymentInstruction &&
        "intermediateRecipientFx" in paymentInstruction
    )
}


htlcContract.on(htlcContract.filters.HTLCERC20Withdraw(null), async (contractId) => {
    console.log(`HTLC Unlock Listener: new HTLCERC20Withdraw event created with parms: 
    {
        "contractId":       ${contractId},
    }`)
    htlcContract.getContract(contractId).then(async lockData => {

        const preImage = lockData.preimage
        const secretLength = lockData.secretLength
        const secretBuffer = Buffer.from(utils.arrayify(preImage))
        const slicedBuffer = secretBuffer.subarray(0, secretLength)
        const secretHex = bufToStr(slicedBuffer)

        console.log(`HTLC Unlock Listener: updating contract: ${contractId} with preimage: ${secretHex}`)
        await DB.run(`UPDATE FXP_DATA_BENNY SET secret = ?, status = '${WITHDRAWN_STATUS}' WHERE lockContract = ?`, [
            secretHex,
            contractId
        ])
        const foundDBRecords = await DB.all("SELECT * FROM FXP_DATA_BENNY WHERE lockContract = ?", [contractId])
        if (foundDBRecords.length) {
            const record = foundDBRecords[0]
            const paymentInstruction = JSON.parse(record.paymentInstructionJson)
            const requestUrl = `${HUB_URL}${PAYMENT_COMPLETION_PATH}`
            const requestPayload = {
                "paymentInstruction": paymentInstruction,
                "secret": record.secret
            }

            let forwardToHostHeader
            if (isPVPVP(paymentInstruction)) {
                const isRecipientPvpvp = paymentInstruction.recipientSystemFx.walletAddress.toLowerCase() === fxpWallet.address.toLowerCase()
                const isIntermediatePvpvp = paymentInstruction.intermediateSenderFx.walletAddress.toLowerCase() === fxpWallet.address.toLowerCase()
                if (isRecipientPvpvp) {
                    forwardToHostHeader = paymentInstruction.intermediateRecipientFx?.host
                } else if (isIntermediatePvpvp) {
                    forwardToHostHeader = paymentInstruction.senderSystemFx?.host
                } else {
                    console.error(`HTLC Unlock Listener: Unsupported PVPVP Transfer. Neither recipientSystemFx or intermediateSenderFx matched my wallet address ${fxpWallet.address}`)
                    return
                }
            } else {
                forwardToHostHeader = paymentInstruction.senderSystemFx?.host
            }

            const requestHeaders = {
                'content-type': 'application/json',
                'x-cbdc': HUB_REQUEST_HEADER_VALUE,
                'x-cbdc-forward-to-host': forwardToHostHeader
            }
            console.log(`HTLC Unlock Listener: About to POST to hub for payment completion, url=${requestUrl}, headers=${JSON.stringify(requestHeaders)}, payload=${JSON.stringify(requestPayload)}`)
            axios.post(
                requestUrl,
                requestPayload,
                {
                    headers: requestHeaders,
                    validateStatus: (status) => status === 200
                }
            ).then((response) => {
                console.log(`HTLC Unlock Listener: POST ${requestUrl} response status=${response.status}, body=${JSON.stringify(response.data)}`)
            }).catch((error) => {
                console.error(`HTLC Unlock Listener: Failed to POST to hub for payment completion, error: ${JSON.stringify(error)}`)
            })
        } else {
            console.info("HTLC Unlock Listener: Did not find a record for contractId: " + contractId)
        }
    })
})




const app = express();
app.use(morgan(':method :url :req[body] :status :res[content-length] - :response-time ms'))
app.use(express.json());


app.post('/payment/setup', asyncHandler(async (req, res, next) => {
    const body = req.body;
    console.log(`Payment Setup: Request body: ${JSON.stringify(body)}`)
    const isValidRequestBody = validatePaymentSetupRequest(body)
    if (!isValidRequestBody) {
        console.error(`Payment Setup: Invalid request body: ${JSON.stringify(validatePaymentSetupRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const paymentInstruction = body.paymentInstruction
    const hash = body.hashOfSecret
    const paymentId = body.paymentInstruction?.paymentId

    const isPvpvp = isPVPVP(paymentInstruction)
    const isIntermediatePvpvp = isPvpvp && paymentInstruction.intermediateSenderFx.walletAddress.toLowerCase() === fxpWallet.address.toLowerCase()
    const isRecipientPvpvp = isPvpvp && paymentInstruction.recipientSystemFx.walletAddress.toLowerCase() === fxpWallet.address.toLowerCase()   

    let targetWallet
    let amount
    if (isPvpvp) {
        if (isIntermediatePvpvp) {
            console.log(`Payment Setup: PVPVP INTERMEDIATE Transfer`)
            targetWallet = paymentInstruction.intermediateRecipientFx.walletAddress.toLowerCase()
            amount = BigNumber.from(Math.round(Number.parseFloat(body.paymentInstruction?.intermediateAmount) * 10 ** NOK_DECIMALS))
        } else if (isRecipientPvpvp) {
            console.log(`Payment Setup: PVPVP RECIPIENT Transfer`)
            targetWallet = paymentInstruction.recipient?.walletAddress.toLowerCase()
            amount = BigNumber.from(Math.round(Number.parseFloat(body.paymentInstruction?.targetAmount) * 10 ** NOK_DECIMALS))
        } else {
            console.error(`Payment Setup: Failed due to unsupported PVPVP transfer. Neither intermediateSenderFx nor recipientSystemFx matched my wallet address ${fxpWallet.address}`)
            res.statusCode = 400
            res.end()
            return
        }
    } else {
        targetWallet = paymentInstruction.recipient?.walletAddress.toLowerCase()
        amount = BigNumber.from(Math.round(Number.parseFloat(body.paymentInstruction?.targetAmount) * 10 ** NOK_DECIMALS))
    }

    const balance = await nokContract.balanceOf(fxpWallet.address)
    if (amount.gt(balance)) {
        console.error(`Payment Setup: Request failed because FXP wallet has insufficient funds. Balance ${balance} < amount ${amount}`)
        res.statusCode = 500
        res.end()
        return
    }

    const existingAllowance = await nokContract.allowance(fxpWallet.address, htlcContract.address)
    if (existingAllowance.lt(amount)) {
        const approveTx = await nokContract.increaseAllowance(htlcContract.address, TARGET_NOK_ALLOWANCE, TX_OVERRIDES)
        await approveTx.wait()
        console.log("Payment Setup: Successfully increased allowance in transaction: " + approveTx.hash)
    }

    const lockMaxDurationMilliseconds = LOCK_MAX_DURATION_MILLISECONDS()
    let lockMaxDurationSeconds = Math.floor(lockMaxDurationMilliseconds / 1000)
    if (isIntermediatePvpvp) {
        console.log(`Payment Setup: INTERMEDIATE PVPVP: Increasing timelock by ${PVPVP_INTERMEDIATE_LOCK_DELAY_SECONDS + PVPVP_INTERMEDIATE_LOCK_NETWORK_DELAY_SECONDS} seconds`)
        lockMaxDurationSeconds = lockMaxDurationSeconds + PVPVP_INTERMEDIATE_LOCK_DELAY_SECONDS + PVPVP_INTERMEDIATE_LOCK_NETWORK_DELAY_SECONDS
    }
    const nowEpochSeconds = Math.floor(new Date() / 1000)
    const lockEndSeconds = lockMaxDurationSeconds + nowEpochSeconds

    let hashLock = hash
    if (!hashLock.startsWith('0x')) {
        hashLock = '0x' + hashLock
    }
    console.log(`Payment Setup: Calling HTLCERC20.newContract(${targetWallet}, ${hashLock}, ${lockEndSeconds}, ${nokContract.address}, ${amount})`)
    const lockTx = await htlcContract.newContract(targetWallet, hashLock, lockEndSeconds, nokContract.address, amount, TX_OVERRIDES)
    const lockTxReceipt = await lockTx.wait()
    const lockId = lockTxReceipt.events.find(e => e.event === 'HTLCERC20New').args[0]
    console.log(`Payment Setup: Successfully created a lock with id: ${lockId} in transaction: ${lockTx.hash} `)

    const timeoutId = setTimeout(() => {
        console.log(`HTLC Lock Expiry Timeout: The timelock of a lock tx has now expired. Fetching the lock tx to check if it has been withdrawn. contractId=${lockId}, paymentId=${paymentId}`)
        htlcContract.getContract(lockId)
            .then((contract) => {
                if (!contract.withdrawn && !contract.refunded) {
                    console.log(`HTLC Lock Expiry Timeout: The timelock of a lock tx has expired because it was not withdrawn in time. Attempting to refund it now. contractId=${lockId}, paymentId=${paymentId}`)
                    htlcContract.refund(lockId)
                        .then(() => {
                            console.log(`HTLC Lock Expiry Timeout: Expired lock tx was successfully refunded. contractId=${lockId}, paymentId=${paymentId}`)
                        })
                        .catch((error) => {
                            console.error(`HTLC Lock Expiry Timeout: failed to refund an expired lock tx. contractId=${lockId}, paymentId=${paymentId}. Error: ${error.message}`)
                        })
                } else if (contract.withdrawn) {
                    console.log(`HTLC Lock Expiry Timeout: lock tx already withdrawn`)
                } else if (contract.refunded) {
                    console.log(`HTLC Lock Expiry Timeout: lock tx already refunded`)
                }
                clearTimeout(timeoutId)
            })
            .catch((error) => {
                console.log(`HTLC Lock Expiry Timeout: Failed to fetch the lock tx to check if the tx has been withdrawn. contractId=${lockId}, paymentId=${paymentId}. Error: ${error.message}`)
                clearTimeout(timeoutId)
            })
    }, lockMaxDurationMilliseconds + 1000)

    const paymentInstructionJson = JSON.stringify(body.paymentInstruction)
    await DB.run("INSERT INTO FXP_DATA_BENNY (hash, amount, paymentId, lockContract, targetWallet, paymentInstructionJson, status) VALUES (?,?,?,?,?,?,?)",
        [hash, amount, paymentId, lockId, targetWallet, paymentInstructionJson, OPEN_STATUS]
    )
    console.log("Payment Setup: FXP persisted payment details for paymentId: " + paymentId)

    if (isIntermediatePvpvp) {
        const fxp_host = paymentInstruction.intermediateRecipientFx.host.split(":")[1].toLowerCase()
        const requestUrl = `${FXP_BASE_URL}/${fxp_host}/payment/locked`
        const requestPayload = {
            "paymentInstruction": paymentInstruction,
            "hashOfSecret": hash,
            "senderSystemLockTimeout": new Date(lockEndSeconds * 1000).toISOString(),
            "lockId": lockId
        }
        console.log(`Payment Setup: about to POST to ${fxp_host} for payment locked, url=${requestUrl}, Request payload=${JSON.stringify(requestPayload)}`)
        axios.post(
            requestUrl,
            requestPayload,
            {
                headers: {
                    'content-type': 'application/json',
                },
                validateStatus: (status) => status === 201
            }
        ).then((response) => {
            console.log(`Payment Setup: POST ${requestUrl} response status=${response.status}, body=${JSON.stringify(response.data)}`)
            const responseBody = {"paymentId": paymentId}
            const isValidResponseBody = validatePaymentSetupResponse(responseBody)
            if (!isValidResponseBody) {
                console.error(`Payment Setup: invalid response body: ${JSON.stringify(validatePaymentSetupResponse.errors)}`)
                res.statusCode = 500
                res.end()
                return
            }
            res.json(responseBody)
        }).catch((error) => {
            console.log(`Payment Setup: Failed to POST to ${fxp_host} for payment locked, error: ${JSON.stringify(error)}`)
            res.statusCode = 500
            res.end()
            return
        })
    } else {
        const responseBody = {"paymentId": paymentId}
        const isValidResponseBody = validatePaymentSetupResponse(responseBody)
        if (!isValidResponseBody) {
            console.error(`Payment Setup: invalid response body: ${JSON.stringify(validatePaymentSetupResponse.errors)}`)
            res.statusCode = 500
            res.end()
            return
        }
        res.json(responseBody)
    }
}))

app.post('/payment/locked', asyncHandler(async (req, res, next) => {
    const body = req.body;
    console.log(`Payment Locked: Request body: ${JSON.stringify(body)}`)
    const isValidRequestBody = validatePaymentLockedRequest(body)
    if (!isValidRequestBody) {
        console.error(`Payment Locked: Invalid request body: ${JSON.stringify(validatePaymentLockedRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const paymentInstruction = body.paymentInstruction;
    const paymentId = paymentInstruction.paymentId;
    const lockId = body.lockId;
    const hash = body.hashOfSecret;
    const senderSystemLockTimeout = body.senderSystemLockTimeout
    const paymentInstructionJson = JSON.stringify(body.paymentInstruction)

    let lockedPaymentSender, lockedPaymentReceiver, forwardToHostHeader, amount
    if (isPVPVP(paymentInstruction)) {
        const isSenderPvpvp = paymentInstruction.senderSystemFx?.walletAddress.toLowerCase() === fxpWallet.address.toLowerCase()
        const isIntermediatePvpvp = paymentInstruction.intermediateRecipientFx?.walletAddress.toLowerCase() === fxpWallet.address.toLowerCase()
        if (isSenderPvpvp) {
            console.log(`Payment Locked: PvPvP SENDER Transfer`)
            lockedPaymentSender = paymentInstruction.sender
            lockedPaymentReceiver = paymentInstruction.senderSystemFx
            forwardToHostHeader = paymentInstruction.intermediateSenderFx?.host
            amount = Math.round(Number.parseFloat(paymentInstruction.sourceAmount) * 10 ** NOK_DECIMALS)
        } else if (isIntermediatePvpvp) {
            console.log(`Payment Locked: PvPvP INTERMEDIATE Transfer`)
            lockedPaymentSender = paymentInstruction.intermediateSenderFx
            lockedPaymentReceiver = paymentInstruction.intermediateRecipientFx
            forwardToHostHeader = paymentInstruction.recipientSystemFx?.host
            amount = Math.round(Number.parseFloat(paymentInstruction.intermediateAmount) * 10 ** NOK_DECIMALS)
        } else {
            console.error(`Payment Locked: Unsupported PvPvP Transfer. Neither senderSystemFx nor intermediateRecipientFx matched my wallet address ${fxpWallet.address}`)
            res.statusCode = 400
            res.end()
            return
        }
    } else {
        lockedPaymentSender = paymentInstruction.sender
        lockedPaymentReceiver = paymentInstruction.senderSystemFx
        forwardToHostHeader = paymentInstruction.recipientSystemFx?.host
        amount = Math.round(Number.parseFloat(paymentInstruction.sourceAmount) * 10 ** NOK_DECIMALS)
    }

    const htlc =  await htlcContract.getContract(lockId)
    if (!htlc) {
        console.error(`Payment Locked: htlc validation failed: HTLC tx not found by contractId ${lockId}`)
        res.statusCode = 400
        res.end()
        return
    }
    if (htlc.sender.toLowerCase() !== lockedPaymentSender.walletAddress.toLowerCase()) {
        console.error(`Payment Locked: sender walletAddress validation failed. Expected: ${htlc.sender.toLowerCase()}, actual: ${paymentInstruction.sender?.walletAddress.toLowerCase()}`)
        res.statusCode = 400
        res.end()
        return
    }
    if (htlc.receiver.toLowerCase() !== lockedPaymentReceiver.walletAddress.toLowerCase()) {
        console.error(`Payment Locked: recipient walletAddress validation failed. Expected: ${htlc.receiver.toLowerCase()}, actual: ${paymentInstruction.recipient?.walletAddress.toLowerCase()}`)
        res.statusCode = 400
        res.end()
        return
    }
    const amountBigNum = BigNumber.from(amount)
    if (!htlc.amount.eq(amountBigNum)) {
        console.error(`Payment Locked: amount validation failed. Expected: ${htlc.amount}, actual: ${amountBigNum}`)
        res.statusCode = 400
        res.end()
        return
    }
    const htlcHashlock = htlc.hashlock.toLowerCase().slice(2)
    if (hash.toLowerCase() !== htlcHashlock) {
        console.error(`Payment Locked: hash validation failed. Expected: ${htlcHashlock}, actual: ${hash.toLowerCase()}`)
        res.statusCode = 400
        res.end()
        return
    }
    const htlcTimelock = new Date(htlc.timelock * 1000).toISOString()
    if (senderSystemLockTimeout !== htlcTimelock) {
        console.error(`Payment Locked: senderSystemLockTimeout validation failed. Expected: ${htlcTimelock}, actual: ${senderSystemLockTimeout}`)
        res.statusCode = 400
        res.end()
        return
    }

    console.log("Payment Locked: FXP received notification of locked funds for paymentId: " + paymentId)
    await DB.run("INSERT INTO FXP_DATA_EMMA (hash, amount, paymentId, lockContract, targetWallet, paymentInstructionJson) VALUES (?,?,?,?,?, ?)",
        [hash, amount, paymentId, lockId, fxpWallet.address, paymentInstructionJson]
    )
    console.log("Payment Locked: FXP pesisted payment details for paymentId: " + paymentId)

    const requestUrl = `${HUB_URL}${PAYMENT_SETUP_PATH}`
    const requestPayload = {
        "paymentInstruction": paymentInstruction,
        "hashOfSecret": hash,
        "senderSystemLockTimeout": senderSystemLockTimeout
    }
    const requestHeaders = {
        'content-type': 'application/json',
        'x-cbdc': HUB_REQUEST_HEADER_VALUE,
        'x-cbdc-forward-to-host': forwardToHostHeader
    }
    console.log(`Payment Locked: about to POST to hub for payment setup, url=${requestUrl}, Request headers=${JSON.stringify(requestHeaders)}, Request payload=${JSON.stringify(requestPayload)}`)
    axios.post(
        requestUrl,
        requestPayload,
        {
            headers: requestHeaders,
            validateStatus: (status) => status === 200
        }
    ).then((response) => {
        console.log(`Payment Locked: POST ${requestUrl} response status=${response.status}, body=${JSON.stringify(response.data)}`)
        res.statusCode = 201
        res.end()
    }).catch((error) => {
        console.log(`Payment Locked: Failed to POST to hub for payment setup, error: ${JSON.stringify(error)}`)
        res.statusCode = 500
        res.end()
    })
}))

app.post('/payment/completion', asyncHandler(async (req, res, next) => {
    const body = req.body;
    console.log(`Payment Completion: Request body: ${JSON.stringify(body)}`)
    const isValidRequestBody = validatePaymentCompletionRequest(body)
    if (!isValidRequestBody) {
        console.error(`Payment Completion: Invalid request body: ${JSON.stringify(validatePaymentCompletionRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const paymentInstruction = body.paymentInstruction;
    const paymentId = paymentInstruction.paymentId;
    const secret = body.secret;
    console.log("Payment Completion: FXP received notification of secret to unlock funds for paymentId: " + paymentId)
    const records = await DB.all("SELECT * FROM FXP_DATA_EMMA WHERE paymentId = ?", [paymentId])
    if (!records) {
        res.statusCode = 404
        res.end()
        return
    }
    const record = records[0]
    const lockId = record.lockContract
    console.log("Payment Completion: Attempting to unlock as fxp for paymentId: " + paymentId)

    let preImage = secret
    if (!preImage.startsWith('0x')) {
        preImage = `0x${secret}`
    }
    const unlockTx = await htlcContract.withdraw(lockId, preImage, TX_OVERRIDES)
    await unlockTx.wait()
    console.log("Payment Completion: Successfully claimed paymentId: " + paymentId)
    const responseBody = {'paymentId': paymentId}
    const isValidResponseBody = validatePaymentCompletionResponse(responseBody)
    if (!isValidResponseBody) {
        console.error(`Payment Completion: Invalid response body: ${JSON.stringify(validatePaymentCompletionResponse.errors)}`)
        res.statusCode = 500
        res.end()
        return
    }
    res.json(responseBody)
}))


console.log(`#### RUNNING AS ${FXP_ID} WITH ADDRESS: ${fxpWallet.address}`)

setIntervalAsync(async () => {
    const existingAllowance = (await nokContract.allowance(fxpWallet.address, htlcContract.address))
    if (existingAllowance.lt(TARGET_NOK_ALLOWANCE.div(BigNumber.from("2")))) {
        console.log("FXP Wallet Allowance Interval: Increasing allowance by: " + (TARGET_NOK_ALLOWANCE.sub(existingAllowance)))
        const approveTx = await nokContract.increaseAllowance(htlcContract.address, (TARGET_NOK_ALLOWANCE.sub(existingAllowance)))
        await approveTx.wait()
    } else {
        console.log("FXP Wallet Allowance Interval: Existing allowance is: " + existingAllowance.toString() + ", no need to increase allowance at this time.")
    }
}, 1000 * 60 * 10)


const IS_SET_FX_RATES_ENABLED = false
const FETCH_RATES_PERIOD_MINUTES = 1
const FX_MARKETS = ["SEK/NOK", "ILS/NOK"]
const FX_API_BASE_URL = process.env.FX_API_BASE_URL
if (IS_SET_FX_RATES_ENABLED) {
    setIntervalAsync(async () => {
        for await (const market of FX_MARKETS) {
            console.log(`Rate Fetcher Interval: Fetching FX rates for market ${market}`)
            const currencies = market.split('/')
            const baseCurrency = currencies[0]
            const quoteCurrency = currencies[1]

            await axios.get(
                `${FX_API_BASE_URL}?from=${baseCurrency.toUpperCase()}&to=${quoteCurrency.toUpperCase()}`, 
                {
                    validateStatus: (status) => status === 200
                }
            ).then((response) => {
                const responseBody = response.data
                if (!responseBody || !("result" in responseBody)) {
                    console.error(`Rate Fetcher Interval: Unable to fetch FX rate. Invalid response body ${responseBody}`)
                    return
                }

                const rate = responseBody["result"]
                if (typeof(rate) !== "number") {
                    console.error(`Rate Fetcher Interval: Unable to fetch FX rate. Result is not a number ${responseBody}`)
                    return
                }

                console.debug(`Rate Fetcher Interval: Fetched ${market} rate: ${rate}`)

                const randomPercentage = getRandomArbitrary(-0.02, 0.02)
                const randomizedRate = rate + (rate * randomPercentage)
                console.debug(`Rate Fetcher Interval: Added ${randomPercentage}% randomness to ${market} rate: ${randomizedRate}`)

                const roundedRandomizedRate = parseFloat(String(randomizedRate)).toFixed(10)
                console.log(`Rate Fetcher Interval: Rounded ${market} rate: ${roundedRandomizedRate}`)
            }).catch((error) => {
                console.error(`Rate Fetcher Interval: Failed to fetch FX rates for market ${market}. Error: ${error}`)
            })
        }
    }, 1000 * 60 * FETCH_RATES_PERIOD_MINUTES)
}


const getRandomArbitrary = (min, max) => {
    return Math.random() * (max - min) + min
}

const port = Number.parseInt(process.env.PORT ?? "8082")

var server = app.listen(port, function () {
    var host = server.address().address
    var port = server.address().port
    console.log("FXP app listening at http://%s:%s", host, port)
})

