import React, { useState } from 'react'
import { Card, Box, CardContent, Stack, Typography, TextField, InputAdornment, Snackbar } from '@mui/material'
import MuiAlert from '@mui/material/Alert'
import Button from '../../../components/elements/Button'
import Image from '../../../components/elements/Image'
import { getTokenBalance, transferTokens } from '../../../hooks/useContract'
import { isAddress, parseUnits } from 'ethers/lib/utils'
import { displayAsCurrency, limitDecimalPlaces } from '../../../utils/format'
import { useGlobalState, updateBalance, setGlobalState } from '../../../state'
import { lookupAddressName } from '../../../utils/address'

const cardStyle = {
    boxShadow: 0,
    borderRadius: 0,
}

const inputProps = {
    backgroundColor: '#F2F8FA',
    border: 'none',
    height: '50px',
    outline: 'none',
    ariaLabel: 'weight',
    fontSize: '95%',
}

const TransferTokens = () => {
    //Snackbar alert parameter
    const [open, setOpen] = useState(false)

    const handleClose = (_, reason) => {
        if (reason === 'clickaway') {
            return
        }
        setOpen(false)
    }

    const [account] = useGlobalState('account')
    const [addressBook] = useGlobalState('addressBook')
    const [balance] = useGlobalState('balance')
    const [provider] = useGlobalState('provider')
    const [signer] = useGlobalState('signer')
    const [amountToTransfer, setAmountToTransfer] = useState('0.0000')
    const [address, setAddress] = useState('')
    const [isMalformedAddress, setIsMalformedAddress] = useState(false)
    const [addressHelperText, setAddressHelperText] = useState('')
    const [msg, setMsg] = useState('')
    const [success, setSuccess] = useState(false)
    const [, setError] = useState(false)
    const [disableBtn, setDisableBtn] = useState(false)
    const [transferBtnText, setTransferBtnText] = useState('TRANSFER TOKENS')


    const handleClick = async () => {
        try {
            setSuccess(false)
            setOpen(false)
            setError(false)
            if (signer == null) {
                setOpen(true)
                setError(true)
                setMsg('Please connect a wallet.')
                return
            }
            if (isAddress(address)) {
                const parsedAmount = parseUnits(amountToTransfer, 4)
                const accountBalance = (await getTokenBalance(account, provider))
                if (parsedAmount.gt(accountBalance)) {
                    setOpen(true)
                    setError(true)
                    setMsg('Balance too low.')
                } else if (amountToTransfer > 0) {
                    setGlobalState('loading', true)
                    setDisableBtn(true)
                    setTransferBtnText('TRANSFERRING TOKENS')

                    const transactionResponse = await transferTokens(address, parseUnits(amountToTransfer, 4), signer)
                    await transactionResponse.wait()

                    setOpen(true)
                    setSuccess(true)
                    setMsg(`Transferred ${amountToTransfer} tokens successfully!`)
                    updateBalance(account, provider)
                    setGlobalState('loading', false)
                    setDisableBtn(false)
                    setTransferBtnText('TRANSFER TOKENS')
                } else {
                    setOpen(true)
                    setError(true)
                    setMsg('Cannot transfer 0 tokens.')
                }
            } else {
                setOpen(true)
                setError(true)
                setMsg('Malformed address. Please check again.')
                setIsMalformedAddress(true)
            }
        } catch (e) {
            console.error(e)
            setDisableBtn(false)
            setTransferBtnText('TRANSFER TOKENS')
            setGlobalState('loading', false)
        }
    }

    const handleTransferAmountChange = (event) => {
        setAmountToTransfer(event.target.value)
    }

    const handleAddressChange = (event) => {
        setAddress(event.target.value)
    }

    const handleTransferAmountInput = (event) => {
        limitDecimalPlaces(event, 4)
    }

    const handleAddressInput = () => {
        setAddressHelperText('')
        setIsMalformedAddress(false)
    }

    const handleAddressName = (_address) => {
        return lookupAddressName(_address, addressBook)
    }

    const Alert = React.forwardRef(function Alert(props, ref) {
        return <MuiAlert elevation={6} ref={ref} variant='filled' {...props} />
    })

    return (
        <Card sx={cardStyle}>
            <Snackbar
                open={open}
                autoHideDuration={6000}
                onClose={handleClose}
            >
                <Alert
                    onClose={handleClose}
                    severity={success ? 'success' : 'error'}
                    sx={{ width: '100%' }}
                >
                    {msg}
                </Alert>
            </Snackbar>
            <CardContent>
                <Typography variant='h6' color='text.secondary' sx={{ fontSize: 18, color: '#153443' }}>
                    TRANSFER TOKENS
                </Typography>

                <Box sx={{ mt: 3 }}>
                    <Stack direction='row' spacing={2}>
                        <Image className='wallet-image' src={`https://avatars.dicebear.com/api/jdenticon/${account}.svg?r=50`} />
                        <Box className='neg-mt'>
                            <Typography variant='p' color='text.secondary' sx={{ fontSize: 12 }}>
                                SEND FROM
                            </Typography>
                            <Typography className='card-text' variant='h6'>
                                {account ? handleAddressName(account) : '-'}<span style={{ position: 'absolute' }}></span>
                            </Typography>
                        </Box>
                    </Stack>
                </Box>
                <Box sx={{ mt: 3 }}>
                    <Stack direction='row' spacing={2}>
                        <Box className='neg-mt'>
                            <Typography variant='p' color='text.secondary' sx={{ fontSize: 12 }}>
                                SEND TO
                            </Typography>
                        </Box>
                    </Stack>
                    <TextField
                        className='no-border'
                        label='Address'
                        id='outlined-start-adornment'
                        value={address}
                        onInput={handleAddressInput}
                        onChange={handleAddressChange}
                        error={isMalformedAddress}
                        helperText={addressHelperText}
                        sx={{ width: '100%' }}
                        InputProps={{
                            style: inputProps
                        }}
                    />
                </Box>
                <Box sx={{ mt: 3 }}>
                    <Typography variant='p' color='text.secondary' sx={{ fontSize: 10 }}>
                        TOKEN TYPE
                    </Typography>
                    <Typography className='card-text' variant='h6'>
                        NOK <span style={{ position: 'absolute' }}></span>
                    </Typography>
                </Box>

                <Box
                    component='form'
                    sx={{
                        '& .MuiTextField-root': { width: '100%' },
                    }}
                    noValidate
                    autoComplete='off'
                    style={{ marginTop: '20px', marginBottom: '20px' }}
                >
                    <TextField
                        className='no-border'
                        label='Amount'
                        id='outlined-start-adornment'
                        value={amountToTransfer}
                        onChange={handleTransferAmountChange}
                        onInput={handleTransferAmountInput}
                        sx={{ width: '100%' }}
                        inputMode='decimal'
                        InputProps={{
                            type: 'number',
                            endAdornment: <InputAdornment position='end'>NOK</InputAdornment>,
                            style: inputProps
                        }}
                    />
                </Box>

                <Box sx={{ mt: 3, mb: 3 }}>
                    <Typography variant='p' color='text.secondary' sx={{ fontSize: 10 }}>
                        FEE
                    </Typography>
                    <Typography className='card-text' variant='h6'>
                        {displayAsCurrency('0')}
                    </Typography>
                </Box>
                <Button disabled={disableBtn} style={{ color: 'white' }} className='button button-primary button-wide-mobile' wide onClick={handleClick}>{transferBtnText}</Button>
            </CardContent>
        </Card>
    )
}

export default TransferTokens