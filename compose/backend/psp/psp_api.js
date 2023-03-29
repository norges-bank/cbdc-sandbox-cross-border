import { createHash, randomBytes } from 'node:crypto'
import fs from 'fs'
import express from 'express';
import asyncHandler from 'express-async-handler'
import sqlite3 from 'sqlite3';
import { open } from 'sqlite'
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats'
import { ethers, utils } from 'ethers';
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

const paymentDiscoveryRequestSchema = JSON.parse(fs.readFileSync('./json-schema/discovery/request-discovery-schema.json', 'utf-8'))
const validatePaymentDiscoveryRequest = ajv.compile(paymentDiscoveryRequestSchema)

const paymentDiscoveryResponseSchema = JSON.parse(fs.readFileSync('./json-schema/discovery/response-discovery-schema.json', 'utf-8'))
const validatePaymentDiscoveryResponse = ajv.compile(paymentDiscoveryResponseSchema)

const secretsByAddressResponseSchema = JSON.parse(fs.readFileSync('./json-schema/secrets-by-address/response-secrets-by-address-schema.json', 'utf-8'))
const validateSecretsByAddressResponse = ajv.compile(secretsByAddressResponseSchema)

const NOK_DECIMALS = 4;
const HTLC_CONTRACT_ADDRESS = process.env.HTLC_CONTRACT_ADDRESS
const HTLC_ABI = JSON.parse(fs.readFileSync('./abi/HashedTimeLockERC20.json', 'utf-8'))

const readSecret = (secretName) => {
    try {
        return fs.readFileSync(`/run/secrets/${secretName}`, 'utf-8').trim();
    } catch(err) {
        console.error(`failed to read secret ${secretName}. Error: ${err}`)
        throw new Error(err)
    }
}

const bufToStr = b => b.toString('hex')

const sha256 = x =>
    createHash('sha256')
        .update(x)
        .digest()

const newSecretHashPair = () => {
    const secret = randomBytes(16)
    const hash = sha256(secret)
    return {
        secret: bufToStr(secret),
        hash: bufToStr(hash),
    }
}

function generateSecret() {
    return newSecretHashPair()
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

const DB = await open({
    filename: './db/psp.db',
    driver: sqlite3.Database
})


await DB.exec(`
CREATE TABLE IF NOT EXISTS PSP_DATA 
(
    targetAddress TEXT NOT NULL, 
    sourceAddress TEXT NOT NULL,
    sourceCurrency TEXT NOT NULL,
    amount INTEGER NOT NULL,
    hash TEXT NOT NULL, 
    secret TEXT NOT NULL,
    paymentId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    lockContract TEXT
)
`)

await DB.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS paymentId_unique
    ON PSP_DATA(paymentId);
`)

const htlcContract = new ethers.Contract(HTLC_CONTRACT_ADDRESS, HTLC_ABI, jsonRPCProvider)

console.log("starting new listener")
htlcContract.on(htlcContract.filters.HTLCERC20New(null, null, null), async (contractId, sender, receiver, tokenContract, amount, hashlock) => {
    console.log(`new HTLC created with parms: 
        {
            "contractId":       ${contractId},
            "sender":           ${sender},
            "receiver":         ${receiver},
            "tokenContract":    ${tokenContract},
            "amount":           ${amount},
            "hashlock":         ${hashlock}
        }
    `)
    const hashOfSecret = hashlock.slice(2)
    await DB.run("UPDATE PSP_DATA SET lockContract = ? WHERE hash = ? and targetAddress = ?", [contractId, hashOfSecret, receiver.toLowerCase()])
})



const app = express();
app.use(express.json());
app.use(morgan('combined'))


app.get('/secret/:secretTargetAddress', asyncHandler(async (req, res, next) => {
    const headers = req.headers
    if (!('x-auth-sig' in headers)) {
        console.error('Missing required auth header')
        res.statusCode = 403
        res.end()
        return
    }
    const authSignature = headers['x-auth-sig']
    const targetAddress = req.params.secretTargetAddress;
    const isValidAddress = utils.isAddress(targetAddress)
    if (!isValidAddress) {
        console.error('Invalid targetAddress request param')
        res.statusCode = 400
        res.end()
        return
    }

    const nowEpochMilliseconds = new Date().getTime()
    const nowEpochSeconds = Math.round(nowEpochMilliseconds / 1000)
    const nowEpochMinutes = Math.round(nowEpochSeconds / 60)
    const validMinutes = [
        nowEpochMinutes,
        nowEpochMinutes + 1,
        nowEpochMinutes - 1,
    ]
    let isAuthenticated = false
    for (const minute of validMinutes) {
        let addressRecovered = utils.recoverAddress(utils.hashMessage(minute.toString()), authSignature)
        if (addressRecovered === targetAddress) {
            isAuthenticated = true
            break
        }
    }
    if (!isAuthenticated) {
        console.error('Invalid auth header')
        res.statusCode = 403
        res.end()
        return
    }

    const selectStatement = `
        SELECT
            targetAddress, 
            sourceAddress,
            sourceCurrency,
            amount,
            hash, 
            secret,
            paymentId,
            createdAt,
            lockContract
        FROM PSP_DATA 
        WHERE targetAddress=?
        ORDER BY createdAt DESC;
    `
    const results = await DB.all(selectStatement, [targetAddress.toLowerCase()])
    const responseBody = []
    for (const row of results) {
        responseBody.push({
            'targetAddress': row.targetAddress,
            'sourceAddress': row.sourceAddress,
            'sourceCurrency': row.sourceCurrency,
            'amount': row.amount,
            'hash': row.hash,
            'secret': row.secret,
            'paymentId': row.paymentId,
            'createdAt': row.createdAt,
            'lockContract': row.lockContract,
        })
    }
    const isValidResponseBody = validateSecretsByAddressResponse(responseBody)
    if (!isValidResponseBody) {
        console.error(`GET Secrets by address: invalid response body: ${JSON.stringify(validateSecretsByAddressResponse.errors)}`)
        res.statusCode = 500
        res.end()
        return
    }
    res.json(responseBody)
}))


app.post('/payment/discovery', asyncHandler(async (req, res, next) => {
    const body = req.body;
    console.log(`Payment Discovery request body: ${JSON.stringify(body)}`)
    const isValidRequestBody = validatePaymentDiscoveryRequest(body)
    if (!isValidRequestBody) {
        console.error(`Payment Discovery: invalid request body: ${JSON.stringify(validatePaymentDiscoveryRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const targetWallet = body.paymentInstruction?.recipient?.walletAddress.toLowerCase()

    if (!utils.isAddress(targetWallet)) {
        res.statusCode = 400
        res.end()
        return
    }

    const sourceCurrency = body.paymentInstruction?.sourceCurrency.toUpperCase()
    const sourceAddress = body.paymentInstruction?.sender?.walletAddress.toLowerCase()
    const paymentId = body.paymentInstruction?.paymentId
    const amount = Math.round(Number.parseFloat(body.paymentInstruction?.targetAmount) * 10 ** NOK_DECIMALS)
    const secretHashPair = generateSecret()
    const insertStatement = `
        INSERT INTO PSP_DATA 
        (
            targetAddress,
            sourceAddress,
            sourceCurrency,
            amount,
            hash,
            secret,
            paymentId,
            createdAt
        )
        VALUES (?,?,?,?,?,?,?,?)
    `
    const insertArgs = [
        targetWallet,
        sourceAddress,
        sourceCurrency,
        amount,
        secretHashPair.hash,
        secretHashPair.secret,
        paymentId,
        new Date().toISOString()
    ]
    await DB.run(insertStatement, insertArgs)

    const lockMaxDurationMilliseconds = LOCK_MAX_DURATION_MILLISECONDS()
    const responseBody = {
        "hashOfSecret": secretHashPair.hash,
        "lockMaxDuration": lockMaxDurationMilliseconds,
        "paymentId": paymentId
    }
    const isValidResponseBody = validatePaymentDiscoveryResponse(responseBody)
    if (!isValidResponseBody) {
        console.error(`Payment Discovery: invalid response body: ${JSON.stringify(validatePaymentDiscoveryResponse.errors)}`)
        res.statusCode = 500
        res.end()
        return
    }
    res.json(responseBody)
}))


const port = Number.parseInt(process.env.PORT ?? "8081")
var server = app.listen(port, function () {
    var host = server.address().address
    var port = server.address().port
    console.log("PSP app listening at http://%s:%s", host, port)
})