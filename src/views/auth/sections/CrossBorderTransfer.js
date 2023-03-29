import React, { useState } from 'react'
import Card from '@mui/material/Card'
import Box from '@mui/material/Box'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import Button from '../../../components/elements/Button'
import { limitDecimalPlaces } from '../../../utils/format'
import { useGlobalState, setGlobalState } from '../../../state'
import { currencyPrecisions, amountToUnits } from '../../../utils/currency'
import { increaseAllowance, allowance, getTokenBalance } from '../../../hooks/useContract'
import { newContract } from '../../../hooks/useHTLC'
import { TOKEN_ADDRESS, HTLC_ADDRESS } from '../../../constants'
import { v4 as uuidv4 } from 'uuid';
import { BigNumber } from 'ethers'

const SENDER_LOCK_DELAY_SECONDS = 60
const SENDER_LOCK_NETWORK_DELAY_SECONDS = 5
const COUNTRIES = [
    {
        'name': 'Norway',
        'currency': 'NOK',
    },
    {
        'name': 'Israel',
        'currency': 'ILS',
    },
    {
        'name': 'Sweden',
        'currency': 'SEK',
    }
]
const FX_RATE_TYPES = {
    "BID": "bid",
    "ASK": "ask",
    "EFFECTIVE": "effective"
}

const cardStyle = {
    boxShadow: 0,
    borderRadius: 0,
}

const inputProps = {
    backgroundColor: '#F2F8FA',
    border: 'none',
    height: '60px',
    outline: 'none',
    ariaLabel: 'weight',
    fontSize: '95%',
}

const hubRequestHeader = process.env.REACT_APP_HUB_REQUEST_HEADER

const CrossBorderTransfer = () => {
    const [account] = useGlobalState('account')
    const [signer] = useGlobalState('signer')
    const [provider] = useGlobalState('provider')
    const [contractToPaymentMap] = useGlobalState('contractToPaymentMap')    

    const [alertOpen, setAlertOpen] = useState(false)
    const [alertMessage, setAlertMessage] = useState('')
    const [alertSuccess, setAlertSuccess] = useState(false)
    const [, setAlertError] = useState(false)
    const handleSnackBarClose = (_, reason) => {
        if (reason === 'clickaway') {
            return
        }
        setAlertOpen(false)
    }
    const Alert = React.forwardRef(function Alert(props, ref) {
        return <MuiAlert elevation={6} ref={ref} variant='filled' {...props} />
    })

    const sourceCurrency = 'NOK'
    const [targetCurrency, setTargetCurrency] = useState('')
    const [amount, setAmount] = useState('0.0000')
    const [amountType, setAmountType] = useState('')
    const [disableQuoteButton, setDisableQuoteButton] = useState(false)
    const [isFetchingQuote, setIsFetchingQuote] = useState(false)
    const [hasFetchedQuote, setHasFetchedQuote] = useState(false)
    const [quoteResponseBody, setQuoteResponseBody] = useState({})
    const [quoteExpiryTimestampEpcohMilliseconds, setQuoteExpiryTimestampEpochMilliseconds] = useState(null)
    const [disableAcceptRateButton, setDisableAcceptRateButton] = useState(false)
    const [disableDeclineRateButton, setDisableDeclineRateButton] = useState(false)
    const [isRateAccepted, setIsRateAccepted] = useState(false)
    const handleAmountChange = event => setAmount(event.target.value)
    const handleAmountInput = event => limitDecimalPlaces(event, currencyPrecisions[amountType === 'TARGET' ? targetCurrency : sourceCurrency])
    const handleAmountTypeChange = event => setAmountType(event.target.value)
    const handleTargetCurrencyChange = event => setTargetCurrency(event.target.value)

    const senderHost = process.env.REACT_APP_SENDER_HOST
    const [recipientHost, setRecipientHost] = useState('')
    const [recipientAddress, setRecipientAddress] = useState('')
    const [isPaymentDiscoveryLoading, setIsPaymentDiscoveryLoading] = useState(false)
    const [paymentDiscoveryResponseBody, setPaymentDiscoveryResponseBody] = useState({})
    const [paymentInstruction, setPaymentInstruction] = useState({})
    const [isRecipientVerified, setIsRecipientVerified] = useState(false)
    const handleRecipientHostChange = event => setRecipientHost(event.target.value.trim())
    const handleRecipientAddressChange = event => setRecipientAddress(event.target.value.trim())

    const [disableTransferButton, setDisableSendButton] = useState(true)
    const [disableCancelTransferButton, setDisableCancelTransferButton] = useState(true)

    const resetState = () => {
        setTargetCurrency('')
        setAmount('0.0000')
        setAmountType('')
        setDisableQuoteButton(false)
        setIsFetchingQuote(false)
        setHasFetchedQuote(false)
        setQuoteResponseBody({})
        setQuoteExpiryTimestampEpochMilliseconds(null)
        setDisableAcceptRateButton(false)
        setDisableDeclineRateButton(false)
        setIsRateAccepted(false)

        setRecipientHost('')
        setRecipientAddress('')
        setIsPaymentDiscoveryLoading(false)
        setPaymentDiscoveryResponseBody({})
        setPaymentInstruction({})
        setIsRecipientVerified(false)

        setDisableSendButton(true)
        setDisableCancelTransferButton(true)
    }

    const handleGetQuoteButtonClick = async () => {
        setAlertSuccess(false)
        setAlertOpen(false)
        setAlertError(false)

        if (signer == null) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Please connect a wallet.')
            return
        }

        if (!amountType) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Please select currency.')
            return
        }

        if (amountType === 'TARGET' && !targetCurrency) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Please select country.')
            return
        }

        const currency = amountType === 'TARGET' ? targetCurrency : sourceCurrency

        const amountString = String(amount)
        if (
            (amountString.includes('.') && amountString.split('.')[1].length > currencyPrecisions[currency]) || 
            (amountString.includes(',') && amountString.split(',')[1].length > currencyPrecisions[currency])
        ) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Amount too precise.')
            return
        }

        const parsedAmount = amountToUnits(amount, currency)
        if (parsedAmount <= 0) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Amount too small: Cannot transfer <= 0 tokens.')
            return
        }
        const balance = await getTokenBalance(account, provider)
        if (parsedAmount.gt(balance)) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Amount too big: You have insufficient funds.')
            return
        }

        setIsFetchingQuote(true)

        const requestPayload = {
            "sourceCurrency": sourceCurrency,
            "targetCurrency": targetCurrency,
        }
        requestPayload[`${amountType.toLowerCase()}Amount`] = Number(amount)

        await fetch('hub/quote', {
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'X-CBDC': hubRequestHeader
            },
            body: JSON.stringify(requestPayload)
        }).then(response => {
            if (!response.ok) {
                throw Error('something went wrong, please try again')
            }
            return response.json()
        }).then(responseBody => {
            console.debug(responseBody)
            setQuoteResponseBody(responseBody)
            setQuoteExpiryTimestampEpochMilliseconds(Date.parse(responseBody.expiryTimestamp))
            setDisableQuoteButton(true)
            setDisableCancelTransferButton(false)
            setIsFetchingQuote(false)
            setHasFetchedQuote(true)
            setAlertOpen(true)
            setAlertSuccess(true)
            setAlertMessage('Cross-border transfer details confirmed')
        }).catch((error) => {
            console.error(error.message)
            setIsFetchingQuote(false)
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(error.message)
        })
    }

    const handleAcceptRateButtonClick = () => {
        const quoteHasExpired = new Date().getTime() > quoteExpiryTimestampEpcohMilliseconds
        if (quoteHasExpired) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('The FX Rate has expired. Please restart the process')
            return
        }
        setIsRateAccepted(true)
        setDisableAcceptRateButton(true)
    }

    const isPvPvP = (paymentInstruction) => {
        return (
            "intermediateCurrency" in paymentInstruction &&
            "intermediateAmount" in paymentInstruction &&
            "intermediateSenderFx" in paymentInstruction &&
            "intermediateRecipientFx" in paymentInstruction
        )
    }

    const verifyRecipientButtonClick = async () => {
        const quoteHasExpired = new Date().getTime() > quoteExpiryTimestampEpcohMilliseconds
        if (quoteHasExpired) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('The FX Rate has expired. Please restart the process')
            return
        }
        if (!recipientAddress && !recipientHost) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Please specify a recipient ID and host.')
            return
        } else if (!recipientAddress) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Please specify a recipient ID.')
            return
        } else if (!recipientHost) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Please specify a recipient host.')
            return
        }
        setIsPaymentDiscoveryLoading(true)
        const newPaymentInstruction = {
            "sourceCurrency": quoteResponseBody.sourceCurrency,
            "targetCurrency": quoteResponseBody.targetCurrency,
            "sourceAmount": quoteResponseBody.sourceAmount,
            "targetAmount": quoteResponseBody.targetAmount,
            "quoteId": quoteResponseBody.quoteId,
            "rate": quoteResponseBody.rate,
            "senderSystemFx": {
                "walletAddress": quoteResponseBody.senderSystemFx?.walletAddress,
                "host": quoteResponseBody.senderSystemFx?.host
            },
            "recipientSystemFx": {
                "walletAddress": quoteResponseBody.recipientSystemFx?.walletAddress,
                "host": quoteResponseBody.recipientSystemFx?.host
            },
            "sender": {
                "walletAddress": account,
                "host": senderHost
            },
            "recipient": {
                "walletAddress": recipientAddress,
                "host": recipientHost
            },
            "paymentId": uuidv4()
        }
        if (isPvPvP(quoteResponseBody)) {
            newPaymentInstruction["intermediateCurrency"] = quoteResponseBody.intermediateCurrency
            newPaymentInstruction["intermediateAmount"] = quoteResponseBody.intermediateAmount
            newPaymentInstruction["intermediateSenderFx"] = {
                "walletAddress": quoteResponseBody.intermediateSenderFx.walletAddress,
                "host": quoteResponseBody.intermediateSenderFx.host
            }
            newPaymentInstruction["intermediateRecipientFx"] = {
                "walletAddress": quoteResponseBody.intermediateRecipientFx.walletAddress,
                "host": quoteResponseBody.intermediateRecipientFx.host
            }
        }
        setPaymentInstruction(newPaymentInstruction)
        const discoveryRequestPayload = JSON.stringify({
            "paymentInstruction": newPaymentInstruction,
        })
        console.debug(discoveryRequestPayload)
        await fetch('/hub/payment/discovery', {
            method: 'post',
            headers: {
                'Content-Type': 'application/json',
                'X-CBDC': hubRequestHeader,
                'X-CBDC-Forward-to-Host': recipientHost,
            },
            body: discoveryRequestPayload
        }).then(response => {
            if (!response.ok) {
                throw Error('something went wrong, please try again')
            }
            return response.json()
        }).then(async (responseBody) => {
            console.debug(responseBody)

            setPaymentDiscoveryResponseBody(responseBody)

            setIsPaymentDiscoveryLoading(false)
            setIsRecipientVerified(true)
            setDisableSendButton(false)

            setAlertOpen(true)
            setAlertSuccess(true)
            setAlertError(false)
            setAlertMessage('Recipient has been verified')
        }).catch((error) => {
            console.error(error.message)
            setIsPaymentDiscoveryLoading(false)
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(error.message)
        })
    }

    const handleTransferButtonClick = async () => {
        const quoteHasExpired = new Date().getTime() > quoteExpiryTimestampEpcohMilliseconds
        if (quoteHasExpired) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('The FX Rate has expired. Please restart the process')
            return
        }

        let currentAllowance = BigNumber.from(0)
        try {
            console.debug(`Calling CB.allowance(owner=${account}, spender=${HTLC_ADDRESS})`)
            currentAllowance = await allowance(account, HTLC_ADDRESS, provider)
        } catch(e) {
            console.error(e)
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Something went wrong, please try again')
            return
        }

        setGlobalState('loading', true)

        const parsedSourceAmount = amountToUnits(String(paymentInstruction.sourceAmount), sourceCurrency)
        const balance = await getTokenBalance(account, provider)
        if (parsedSourceAmount.gt(balance)) {
            setGlobalState('loading', false)
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Amount too big: You have insufficienct funds.')
            return
        }

        const allowanceDiff = parsedSourceAmount.sub(currentAllowance)
        console.debug(`currentAllowance=${currentAllowance}, amount=${parsedSourceAmount}, allowanceDiff=${allowanceDiff}, balance=${balance}`)

        if (allowanceDiff.gt(BigNumber.from(0))) {
            try {
                console.debug(`Calling CB.increaseAllowance(${HTLC_ADDRESS}, ${allowanceDiff})`)
                const increaseAllowanceResponseBody = await increaseAllowance(HTLC_ADDRESS, allowanceDiff, signer)
                await increaseAllowanceResponseBody.wait()
            } catch(e) {
                console.error(e)
                setDisableSendButton(false)
                setDisableCancelTransferButton(false)
                setGlobalState('loading', false)
    
                setAlertOpen(true)
                setAlertSuccess(false)
                setAlertError(true)
                setAlertMessage('Failed to increase allowance. Please check your balance and try again')
                return
            }
        }

        setDisableSendButton(true)
        setDisableCancelTransferButton(true)

        const lockMaxDurationMilliseconds = paymentDiscoveryResponseBody.lockMaxDuration
        const lockMaxDurationSeconds = Math.floor(lockMaxDurationMilliseconds / 1000)
        const nowEpochSeconds = Math.floor(new Date() / 1000)
        let senderTimeLockDurationSeconds = lockMaxDurationSeconds + SENDER_LOCK_DELAY_SECONDS + SENDER_LOCK_NETWORK_DELAY_SECONDS
        if (isPvPvP(paymentInstruction)) {
            senderTimeLockDurationSeconds = senderTimeLockDurationSeconds + SENDER_LOCK_DELAY_SECONDS
        }
        const senderTimeLockEpochSeconds = nowEpochSeconds + senderTimeLockDurationSeconds

        const hashOfSecret = paymentDiscoveryResponseBody.hashOfSecret
        let hashLock = hashOfSecret
        if (!hashLock.startsWith('0x')) {
            hashLock = `0x${hashOfSecret}`
        }

        let contractId = null
        try {
            console.debug(`Calling HTLCERC20.newContract(${paymentInstruction.senderSystemFx.walletAddress}, ${hashLock}, ${senderTimeLockEpochSeconds}, ${TOKEN_ADDRESS}, ${parsedSourceAmount})`)
            const newContractResponseBody = await newContract(
                paymentInstruction.senderSystemFx.walletAddress, 
                hashLock, 
                senderTimeLockEpochSeconds, 
                TOKEN_ADDRESS, 
                parsedSourceAmount, 
                signer)
            const newContractTransactionReceipt = await newContractResponseBody.wait()
            contractId = newContractTransactionReceipt.events.find(e => e.event === 'HTLCERC20New').args[0]
        } catch(e) {
            console.error(e)
            setDisableSendButton(false)
            setDisableCancelTransferButton(false)
            setGlobalState('loading', false)

            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Failed to send the transfer. Please wait a few minutes and try again.')
            return
        }

        if (!contractId) {
            console.error('contractId not found')
            setDisableCancelTransferButton(false)
            setGlobalState('loading', false)
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Something went wrong, please wait until the transfer is refundable and refund it.')
            resetState()
            return
        }

        const newContractToPaymentMap = contractToPaymentMap
        newContractToPaymentMap[contractId] = paymentInstruction.paymentId
        setGlobalState('contractToPaymentMap', newContractToPaymentMap)

        const fxp_host = paymentInstruction.senderSystemFx.host.split(":")[1].toLowerCase()
        const requestPayload = JSON.stringify({
            "paymentInstruction": paymentInstruction,
            "hashOfSecret": hashOfSecret,
            "senderSystemLockTimeout": new Date(senderTimeLockEpochSeconds * 1000).toISOString(),
            "lockId": contractId
        })
        console.debug(requestPayload)
        await fetch(`/${fxp_host}/payment/locked`, {
            method: 'post',
            headers: {
                'Content-Type': 'application/json'
            },
            body: requestPayload
        }).then(response => {
            if (!response.ok) {
                throw Error('something went wrong, please try again')
            }
            setDisableSendButton(true)
            setDisableCancelTransferButton(true)
            setGlobalState('loading', false)

            setAlertOpen(true)
            setAlertSuccess(true)
            setAlertError(false)
            setAlertMessage('Cross-border transfer is successfully sent')

            resetState()
        }).catch((error) => {
            console.error(error.message)
            setDisableCancelTransferButton(false)
            setGlobalState('loading', false)

            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage('Something went wrong, please wait until the transfer is refundable and refund it.')

            resetState()
        })
    }

    return (
        <Card sx={cardStyle}>
            <Snackbar
                open={alertOpen}
                autoHideDuration={6000}
                onClose={handleSnackBarClose}
            >
                <Alert
                    onClose={handleSnackBarClose}
                    severity={alertSuccess ? 'success' : 'error'}
                    sx={{ width: '100%' }}
                >
                    {alertMessage}
                </Alert>
            </Snackbar>
            <CardContent>
                <Typography variant='h6' color='text.secondary' sx={{ fontSize: 18, color: '#153443' }}>
                    NEW CROSS BORDER TRANSFER
                </Typography>
                <Box sx={{ mt: 3 }}>
                    <Typography variant='p' color='text.secondary' sx={{ fontSize: 16 }}>
                        AMOUNT
                    </Typography>
                    <Box component='form' sx={{ mt: 2 }}>
                        <FormControl fullWidth>
                            <InputLabel id="select-country-label">Country</InputLabel>
                            <Select
                                id='select-country'
                                labelId='select-country-label'
                                label='Country'
                                value={targetCurrency}
                                sx={{ width: '100%' }}
                                onChange={handleTargetCurrencyChange}
                            >
                                {COUNTRIES.map((country) => (
                                    <MenuItem key={country.currency} value={country.currency}>{country.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                    <Box component='form' sx={{ mt: 2 }}>
                        <FormControl fullWidth>
                            <InputLabel id="select-amount-type-label">Currency</InputLabel>
                            <Select
                                id='select-amount-type'
                                labelId='select-amount-type-label'
                                label='Country'
                                value={amountType}
                                sx={{ width: '100%' }}
                                onChange={handleAmountTypeChange}
                            >
                                <MenuItem value={"SOURCE"}>NOK</MenuItem>
                                <MenuItem value={"TARGET"}>Receiver's Currency {targetCurrency ? `(${targetCurrency})` : ''}</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                    <Box
                        component='form'
                        noValidate
                        autoComplete='off'
                        sx={{ mt: 3 }}
                    >
                        <TextField
                            className='no-border'
                            label='Amount'
                            id='outlined-start-adornment'
                            value={amount}
                            onChange={handleAmountChange}
                            onInput={handleAmountInput}
                            onWheel={(e) => e.target.blur()}
                            sx={{ width: '100%' }}
                            inputMode='decimal'
                            InputProps={{
                                type: 'number',
                                endAdornment: <InputAdornment position='end'>{amountType === 'TARGET' ? targetCurrency : amountType === 'SOURCE' ? sourceCurrency : ''}</InputAdornment>,
                                style: inputProps
                            }}
                        />
                    </Box>
                </Box>

                <Box sx={{ mt: 3 }}>
                    <Button 
                        disabled={disableQuoteButton} 
                        loading={isFetchingQuote}
                        style={{ color: 'white' }} 
                        className='button button-primary button-wide-mobile' 
                        wide 
                        onClick={handleGetQuoteButtonClick}
                    >
                        {hasFetchedQuote ? 'BEST FX RATE FOUND' : 'GET FX RATE'}
                    </Button>
                </Box>

                <Box sx={{ mt: 3, mb: 3 }}>
                    {hasFetchedQuote && (
                        <Stack>
                            <Box>
                                <Typography variant='p' color='text.primary' sx={{ fontSize: 18 }}>
                                    FX Rate Details
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='primary.main' sx={{ fontSize: 14 }}>
                                    You Send
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='text.secondary' sx={{ fontSize: 14 }}>
                                    {quoteResponseBody.sourceAmount} {quoteResponseBody.sourceCurrency}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='primary.main' sx={{ fontSize: 14 }}>
                                    Recipient Gets
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='text.secondary' sx={{ fontSize: 14 }}>
                                    {quoteResponseBody.targetAmount} {quoteResponseBody.targetCurrency}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='primary.main' sx={{ fontSize: 14 }}>
                                    FX Provider
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='text.secondary' sx={{ fontSize: 14 }}>
                                    {quoteResponseBody.fxName}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='primary.main' sx={{ fontSize: 14 }}>
                                    FX Conversion Rate
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='text.secondary' sx={{ fontSize: 14 }}>
                                    {quoteResponseBody?.rateType === FX_RATE_TYPES.BID && (
                                        `1 ${quoteResponseBody.sourceCurrency} = ${quoteResponseBody.rate} ${quoteResponseBody.targetCurrency}`
                                    )}
                                    {quoteResponseBody?.rateType === FX_RATE_TYPES.ASK && (
                                        `${quoteResponseBody.rate} ${quoteResponseBody.sourceCurrency} = 1 ${quoteResponseBody.targetCurrency}`
                                    )}
                                    {quoteResponseBody?.rateType === FX_RATE_TYPES.EFFECTIVE && (
                                        `1 ${quoteResponseBody.sourceCurrency} = ${quoteResponseBody.rate} ${quoteResponseBody.targetCurrency}`
                                    )}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='primary.main' sx={{ fontSize: 14 }}>
                                    FX Conversion Rate Valid Until
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant='p' color='text.secondary' sx={{ fontSize: 14 }}>
                                    {new Date(quoteExpiryTimestampEpcohMilliseconds).toLocaleString()}
                                </Typography>
                            </Box>

                            <Stack direction='row' sx={{ mt: 3 }}>
                                <Button 
                                    disabled={disableAcceptRateButton} 
                                    style={{ color: 'white', width: '40%' }} 
                                    className='button button-primary button-wide-mobile' 
                                    wide 
                                    onClick={handleAcceptRateButtonClick}
                                >
                                    {isRateAccepted ? 'RATE ACCEPTED' : 'ACCEPT RATE'}
                                </Button>
                                <Box sx={{width: '20%'}}/>
                                <Button 
                                    disabled={disableDeclineRateButton} 
                                    style={{ color: 'white', width: '40%' }} 
                                    className='button button-primary button-wide-mobile' 
                                    wide 
                                    onClick={resetState}
                                >
                                    DECLINE RATE
                                </Button>
                            </Stack>
                        </Stack>
                    )}
                </Box>

                <Box sx={{ mt: 3, mb: 3 }}>
                    {isRateAccepted && (
                        <Stack>
                            <Box>
                                <Typography variant='p' color='text.primary' sx={{ fontSize: 18 }}>
                                    Recipient Details
                                </Typography>
                            </Box>
                            <Box component='form' sx={{ mt: 2 }}>
                                <TextField
                                    className='no-border'
                                    label='Recipient Host'
                                    id='recipient-host-textfield'
                                    value={recipientHost}
                                    onChange={handleRecipientHostChange}
                                    sx={{ width: '100%' }}
                                    InputProps={{
                                        style: inputProps
                                    }}
                                />
                            </Box>
                            <Box component='form' sx={{ mt: 2 }}>
                                <TextField
                                    className='no-border'
                                    label='Recipient ID'
                                    id='recipient-id-textfield'
                                    value={recipientAddress}
                                    onChange={handleRecipientAddressChange}
                                    sx={{ width: '100%' }}
                                    InputProps={{
                                        style: inputProps
                                    }}
                                />
                            </Box>
                            <Box sx={{ mt: 1 }}>
                                <Button 
                                    disabled={isRecipientVerified}
                                    loading={isPaymentDiscoveryLoading}
                                    style={{ color: 'white', width: '30%' }} 
                                    className='button button-primary button-wide-mobile' 
                                    wide 
                                    onClick={verifyRecipientButtonClick}
                                >
                                    {isRecipientVerified ? 'RECIPIENT VERIFIED' : 'VERIFY RECIPIENT'}
                                </Button>
                            </Box>
                        </Stack>
                    )}
                </Box>

                <Box sx={{ mt: 3, mb: 3 }}>
                    {isRecipientVerified && (
                        <Stack direction='row' sx={{ mt: 3 }}>
                            <Button 
                                disabled={disableTransferButton} 
                                style={{ color: 'white', width: '40%' }} 
                                className='button button-primary button-wide-mobile' 
                                wide 
                                onClick={handleTransferButtonClick}
                            >
                                TRANSFER
                            </Button>
                            <Box sx={{width: '20%'}}/>
                            <Button 
                                disabled={disableCancelTransferButton} 
                                style={{ color: 'white', width: '40%' }} 
                                className='button button-primary button-wide-mobile' 
                                wide 
                                onClick={resetState}
                            >
                                CANCEL
                            </Button>
                        </Stack>
                    )}
                </Box>
            </CardContent>
        </Card>
    )
}

export default CrossBorderTransfer