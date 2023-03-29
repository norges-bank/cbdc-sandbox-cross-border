import express from 'express';
import asyncHandler from 'express-async-handler'
import axios from 'axios';
import morgan from 'morgan';
import fs from 'fs'
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats'
import { v4 as uuidv4 } from 'uuid';
import currency_codes from 'currency-codes'
import bankersRounding from 'bankers-rounding'

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

const quoteRequestSchema = JSON.parse(fs.readFileSync('./json-schema/quote/request-quote-schema.json', 'utf-8'))
const validateQuoteRequest = ajv.compile(quoteRequestSchema)

const quoteResponseSchema = JSON.parse(fs.readFileSync('./json-schema/quote/response-quote-schema.json', 'utf-8'))
const validateQuoteResponse = ajv.compile(quoteResponseSchema)

const paymentDiscoveryRequestSchema = JSON.parse(fs.readFileSync('./json-schema/discovery/request-discovery-schema.json', 'utf-8'))
const validatePaymentDiscoveryRequest = ajv.compile(paymentDiscoveryRequestSchema)

const paymentDiscoveryResponseSchema = JSON.parse(fs.readFileSync('./json-schema/discovery/response-discovery-schema.json', 'utf-8'))
const validatePaymentDiscoveryResponse = ajv.compile(paymentDiscoveryResponseSchema)

const paymentSetupRequestSchema = JSON.parse(fs.readFileSync('./json-schema/setup/request-setup-schema.json', 'utf-8'))
const validatePaymentSetupRequest = ajv.compile(paymentSetupRequestSchema)

const paymentSetupResponseSchema = JSON.parse(fs.readFileSync('./json-schema/setup/response-setup-schema.json', 'utf-8'))
const validatePaymentSetupResponse = ajv.compile(paymentSetupResponseSchema)

const paymentCompletionRequestSchema = JSON.parse(fs.readFileSync('./json-schema/completion/request-completion-schema.json', 'utf-8'))
const validatePaymentCompletionRequest = ajv.compile(paymentCompletionRequestSchema)

const paymentCompletionResponseSchema = JSON.parse(fs.readFileSync('./json-schema/completion/response-completion-schema.json', 'utf-8'))
const validatePaymentCompletionResponse = ajv.compile(paymentCompletionResponseSchema)

const FX_PROVIDERS = {
    "FXP1": {
        "name": "FXP1",
        "NO": {
            "walletAddress": process.env.NO_FXP1_WALLET_ADDRESS,
            "host": process.env.NO_FXP1_HOST_NAME,
        },
        "IL": {
            "walletAddress": "0x123abc",
            "host": process.env.IL_FXP1_HOST_NAME,
        },
        "SE": {
            "walletAddress": uuidv4(),
            "host": process.env.SE_FXP1_HOST_NAME,
        }
    },
    "FXP2": {
        "name": "FXP2",
        "NO": {
            "walletAddress": process.env.NO_FXP2_WALLET_ADDRESS,
            "host": process.env.NO_FXP2_HOST_NAME,
        }
    }
}
const FX_RATE_TYPES = {
    "BID": "bid",
    "ASK": "ask",
    "EFFECTIVE": "effective"
}

const CBDC_HEADER = 'x-cbdc'
const FORWARD_TO_HOST_HEADER = 'x-cbdc-forward-to-host'
const HUB_REQUEST_HEADER_VALUE = process.env.HUB_REQUEST_HEADER
const HUB_RESPONSE_HEADER_VALUE = process.env.HUB_RESPONSE_HEADER

const IS_PVPVP_ENABLED = (process.env.IS_PVPVP_ENABLED === "true")

const lookupHost = (host) => {
    const envSafeRepresentation = host.replaceAll(":", "_")
    console.log(`performing lookup of host: ${envSafeRepresentation}_HOST`)
    const hostUrl = process.env[`${envSafeRepresentation}_HOST`]
    return hostUrl
}

const CURRENCY_PRECISIONS = {
    'ILS': 2,
    'NOK': 2,
    'SEK': 2
}

const app = express();
app.use(morgan(':method :url :req[body] :status :res[content-length] - :response-time ms'))
app.use((req, res, next) => {
    res.append(CBDC_HEADER, HUB_RESPONSE_HEADER_VALUE)
    next()
})
app.use(express.json());


app.post('/quote', asyncHandler(async (req, res, next) => {
    const headers = req.headers;
    if (!(CBDC_HEADER in headers)) {
        console.error('GetQuote: missing required cbdc header')
        res.statusCode = 403
        res.end()
        return
    }
    if (headers[CBDC_HEADER] !== HUB_REQUEST_HEADER_VALUE) {
        console.error('GetQuote: invalid cbdc header')
        res.statusCode = 403
        res.end()
        return
    }

    const body = req.body;
    console.log(`GetQuote: request body=${JSON.stringify(body)}`)
    const isValidRequestBody = validateQuoteRequest(body)
    if (!isValidRequestBody) {
        console.error(`GetQuote: invalid request body: ${JSON.stringify(validateQuoteRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const rateType = FX_RATE_TYPES.BID
    let rate, senderFxpHost, recipientFxpHost, fxpName, fxpAddress

    if (body.sourceCurrency === 'NOK' && body.targetCurrency === 'SEK') {
        rate = 1.0448
        senderFxpHost = FX_PROVIDERS.FXP1.NO.host
        recipientFxpHost = FX_PROVIDERS.FXP1.SE.host
        fxpName = FX_PROVIDERS.FXP1.name
        fxpAddress = FX_PROVIDERS.FXP1.NO.walletAddress
    } else if (body.sourceCurrency === 'NOK' && body.targetCurrency === 'ILS') {
        rate = 0.3383
        senderFxpHost = FX_PROVIDERS.FXP1.NO.host
        recipientFxpHost = FX_PROVIDERS.FXP1.IL.host
        fxpName = FX_PROVIDERS.FXP1.name
        fxpAddress = FX_PROVIDERS.FXP1.NO.walletAddress
    } else if (body.sourceCurrency === 'NOK' && body.targetCurrency === 'NOK') {
        rate = 1.0
        if (Math.random() > 0.5) {
            senderFxpHost = FX_PROVIDERS.FXP2.NO.host
            recipientFxpHost = FX_PROVIDERS.FXP2.NO.host
            fxpName = FX_PROVIDERS.FXP2.name
            fxpAddress = FX_PROVIDERS.FXP2.NO.walletAddress
        } else {
            senderFxpHost = FX_PROVIDERS.FXP1.NO.host
            recipientFxpHost = FX_PROVIDERS.FXP1.NO.host
            fxpName = FX_PROVIDERS.FXP1.name
            fxpAddress = FX_PROVIDERS.FXP1.NO.walletAddress
        }
    } else {
        console.error(`GetQuote: currency pair not supported: ${JSON.stringify(body)}`)
        res.statusCode = 400
        res.end()
        return
    }

    let sourceAmount, targetAmount;
    if (body.sourceAmount) {
        sourceAmount = parseFloat(body.sourceAmount)
        targetAmount = rateType === FX_RATE_TYPES.BID ? sourceAmount * rate : sourceAmount / rate
    } else {
        targetAmount = parseFloat(body.targetAmount)
        sourceAmount = rateType === FX_RATE_TYPES.BID ? targetAmount / rate : targetAmount * rate
    }

    const expiryTimestamp = new Date()
    expiryTimestamp.setMinutes(expiryTimestamp.getMinutes() + 5)

    const responseBody = {
        "sourceCurrency": body.sourceCurrency,
        "targetCurrency": body.targetCurrency,
        "sourceAmount": bankersRounding(sourceAmount, CURRENCY_PRECISIONS[body.sourceCurrency]),
        "targetAmount": bankersRounding(targetAmount, CURRENCY_PRECISIONS[body.targetCurrency]),
        "quoteId": uuidv4(),
        "rate": rate,
        "rateType": rateType,
        "fxName": fxpName,
        "senderSystemFx": {
            "walletAddress": fxpAddress,
            "host": senderFxpHost,
        },
        "recipientSystemFx": {
            "walletAddress": fxpAddress,
            "host": recipientFxpHost,
        },
        "expiryTimestamp": expiryTimestamp.toISOString()
    }

    if (IS_PVPVP_ENABLED === true && body.sourceCurrency === "NOK" && body.targetCurrency === "NOK") {
        responseBody.rateType = FX_RATE_TYPES.EFFECTIVE
        responseBody.fxName = `${FX_PROVIDERS.FXP1.name} + ${FX_PROVIDERS.FXP2.name}`
        responseBody.senderSystemFx.walletAddress = FX_PROVIDERS.FXP1.NO.walletAddress
        responseBody.senderSystemFx.host = FX_PROVIDERS.FXP1.NO.host
        responseBody["intermediateSenderFx"] = {
            "walletAddress": FX_PROVIDERS.FXP1.NO.walletAddress,
            "host": FX_PROVIDERS.FXP1.NO.host
        }
        responseBody["intermediateCurrency"] = "NOK"
        responseBody["intermediateAmount"] = responseBody.sourceAmount
        responseBody["intermediateRecipientFx"] = {
            "walletAddress": FX_PROVIDERS.FXP2.NO.walletAddress,
            "host": FX_PROVIDERS.FXP2.NO.host
        }
        responseBody.recipientSystemFx.walletAddress = FX_PROVIDERS.FXP2.NO.walletAddress
        responseBody.recipientSystemFx.host = FX_PROVIDERS.FXP2.NO.host
    }

    const isValidResponseBody = validateQuoteResponse(responseBody)
    if (!isValidResponseBody) {
        console.error(`GetQuote: invalid response body: ${JSON.stringify(validateQuoteResponse.errors)}`)
        res.statusCode = 500
        res.end()
        return
    }
    res.json(responseBody)
}));

app.post("/payment/discovery", asyncHandler(async (req, res, next) => {
    const headers = req.headers;
    if (!(CBDC_HEADER in headers)) {
        console.error('Payment Discovery: missing required cbdc header')
        res.statusCode = 403
        res.end()
        return
    }
    if (headers[CBDC_HEADER] !== HUB_REQUEST_HEADER_VALUE) {
        console.error('Payment Discovery: invalid cbdc header')
        res.statusCode = 403
        res.end()
        return
    }
    const forwardToHostHeader = headers[FORWARD_TO_HOST_HEADER]
    if (!forwardToHostHeader) {
        console.error('Payment Discovery: missing required forward-to-host header')
        res.statusCode = 400
        res.end()
        return
    }

    const body = req.body;
    console.log(`Payment Discovery: request body=${JSON.stringify(body)}`)
    const isValidRequestBody = validatePaymentDiscoveryRequest(body)
    if (!isValidRequestBody) {
        console.error(`Payment Discovery: invalid request body: ${JSON.stringify(validatePaymentDiscoveryRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const hostUrl = lookupHost(forwardToHostHeader)
    if (!hostUrl) {
        console.error(`Payment Discovery: Unable to forward to unsupported host: ${forwardToHostHeader}`)
        res.statusCode = 400
        res.end()
        return
    }
    const url = `${hostUrl}/payment/discovery`
    console.log(`Payment Discovery: About to POST ${url} with payload ${JSON.stringify(body)}`)
    axios.post(
        url, 
        body, 
        {
            validateStatus: (status) => status === 200
        }
    ).then((response) => {
        console.log(`Payment Discovery: POST ${url} response status=${response.status}, body=${JSON.stringify(response.data)}`)
        const responseBody = response.data
        const isValidResponseBody = validatePaymentDiscoveryResponse(responseBody)
        if (!isValidResponseBody) {
            console.error(`Payment Discovery: invalid response body: ${JSON.stringify(validatePaymentDiscoveryResponse.errors)}`)
            res.statusCode = 500
            res.end()
            return
        }
        res.json(responseBody)
        return
    }).catch((error) => {
        console.error(`Payment Discovery: POST ${url} failed, error: ${error.toJSON()}`)
        res.statusCode = error.response.status
        res.end()
        return
    })
}))


app.post("/payment/setup", asyncHandler(async (req, res, next) => {
    const headers = req.headers;
    if (!(CBDC_HEADER in headers)) {
        console.error('Payment Setup: missing required cbdc header')
        res.statusCode = 403
        res.end()
        return
    }
    if (headers[CBDC_HEADER] !== HUB_REQUEST_HEADER_VALUE) {
        console.error('Payment Setup: invalid cbdc header')
        res.statusCode = 403
        res.end()
        return
    }
    const forwardToHostHeader = headers[FORWARD_TO_HOST_HEADER]
    if (!forwardToHostHeader) {
        console.error('Payment Setup: missing required forward-to-host header')
        res.statusCode = 400
        res.end()
        return
    }

    const body = req.body;
    console.log(`Payment Setup: request body=${JSON.stringify(body)}`)
    const isValidRequestBody = validatePaymentSetupRequest(body)
    if (!isValidRequestBody) {
        console.error(`Payment Setup: invalid request body: ${JSON.stringify(validatePaymentSetupRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const paymentInstruction = body.paymentInstruction
    const hostUrl = lookupHost(forwardToHostHeader)
    if (!hostUrl) {
        console.error(`Payment Setup: Unable to forward to unsupported host: ${forwardToHostHeader}`)
        res.statusCode = 400
        res.end()
        return
    }
    const url = `${hostUrl}/payment/setup`
    console.log(`Payment Setup: About to POST ${url} with payload ${JSON.stringify(body)}`)
    axios.post(
        url, 
        body, 
        {
            validateStatus: (status) => status === 200
        }
    ).then((response) => {
        console.log(`Payment Setup: POST ${url} response status=${response.status}, body=${JSON.stringify(response.data)}`)
        const fxpPaymentId = response.data?.paymentId
        if (!fxpPaymentId) {
            console.error('Payment Setup: receiver system FX did not return expected response body')
            res.statusCode = 500
            res.end()
            return
        }
        if (fxpPaymentId !== paymentInstruction.paymentId) {
            console.error('Payment Setup: invalid response body received from fxp')
            res.statusCode = 500
            res.end()
            return
        }
        const responseBody = {'paymentId': fxpPaymentId}
        const isValidResponseBody = validatePaymentSetupResponse(responseBody)
        if (!isValidResponseBody) {
            console.error(`Payment Setup: invalid response body: ${JSON.stringify(validatePaymentSetupResponse.errors)}`)
            res.statusCode = 500
            res.end()
            return
        }
        res.json(responseBody)
    }).catch((error) => {
        console.error(`Payment Setup: POST ${url} failed, error: ${error.toJSON()}`)
        res.statusCode = error.response.status
        res.end()
    })
}))

app.post('/payment/completion', asyncHandler(async (req, res, next) => {
    const headers = req.headers;
    if (!(CBDC_HEADER in headers)) {
        console.error('Payment Completion: missing required cbdc header')
        res.statusCode = 403
        res.end()
        return
    }
    if (headers[CBDC_HEADER] !== HUB_REQUEST_HEADER_VALUE) {
        console.error('Payment Completion: invalid cbdc header')
        res.statusCode = 403
        res.end()
        return
    }
    const forwardToHostHeader = headers[FORWARD_TO_HOST_HEADER]
    if (!forwardToHostHeader) {
        console.error('Payment Completion: missing required forward-to-host header')
        res.statusCode = 400
        res.end()
        return
    }

    const body = req.body;
    console.log(`Payment Completion: request body=${JSON.stringify(body)}`)
    const isValidRequestBody = validatePaymentCompletionRequest(body)
    if (!isValidRequestBody) {
        console.error(`Payment Completion: invalid request body: ${JSON.stringify(validatePaymentCompletionRequest.errors)}`)
        res.statusCode = 400
        res.end()
        return
    }

    const paymentInstruction = body.paymentInstruction
    const hostUrl = lookupHost(forwardToHostHeader)
    if (!hostUrl) {
        console.error(`Payment Completion: Unable to forward to unsupported host: ${forwardToHostHeader}`)
        res.statusCode = 400
        res.end()
        return
    }
    const url = `${hostUrl}/payment/completion`
    console.log(`Payment Completion: About to POST ${url} with payload ${JSON.stringify(body)}`)
    axios.post(
        url, 
        body, 
        {
            validateStatus: (status) => status === 200
        }
    ).then((response) => {
        console.log(`Payment Completion: POST ${url} response status=${response.status}, body=${JSON.stringify(response.data)}`)
        const fxpPaymentId = response.data?.paymentId
        if (!fxpPaymentId) {
            console.error('receiver system FX did not return expected response body')
            res.statusCode = 500
            res.end()
            return
        }
        if (fxpPaymentId !== paymentInstruction.paymentId) {
            console.error('invalid response body received from fxp')
            res.statusCode = 500
            res.end()
            return
        }
        const responseBody = {'paymentId': fxpPaymentId}
        const isValidResponseBody = validatePaymentCompletionResponse(responseBody)
        if (!isValidResponseBody) {
            console.error(`Payment Completion: invalid response body: ${JSON.stringify(validatePaymentCompletionResponse.errors)}`)
            res.statusCode = 500
            res.end()
            return
        }
        res.json(responseBody)
    }).catch((error) => {
        console.error(`Payment Completion: POST ${url} failed, error: ${error.toJSON()}`)
        res.statusCode = error.response.status
        res.end()
    })

}))

const port = Number.parseInt(process.env.PORT ?? "8083")
var server = app.listen(port, function () {
    var host = server.address().address
    var port = server.address().port
    console.log("HUB app listening at http://%s:%s", host, port)
})