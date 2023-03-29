import React, { useState } from 'react'
import { Card, Box, CardContent, Typography, TextField, InputAdornment, Snackbar } from '@mui/material'
import MuiAlert from '@mui/material/Alert'
import Button from '../../../components/elements/Button'
import { burnTokens, hasRole } from '../../../hooks/useContract'
import { parseUnits } from 'ethers/lib/utils'
import { limitDecimalPlaces } from '../../../utils/format'
import { setGlobalState, updateBalance, updateTotalSupply, useGlobalState } from '../../../state'
import { BURNER_ROLE } from '../../../constants'

const cardStyle = {
    boxShadow: 0,
    borderRadius: 0,
}

const inputProps = {
    backgroundColor: '#F2F8FA',
    border: '0px',
    height: '50px',
    ariaLabel: 'weight',
}

const BurnTokens = () => {
    //Snackbar alert parameter
    const [open, setOpen] = useState(false)

    const handleClose = (_, reason) => {
        if (reason === 'clickaway') {
            return
        }

        setOpen(false)
    }

    const [account] = useGlobalState('account')
    const [provider] = useGlobalState('provider')
    const [signer] = useGlobalState('signer')
    const [amountToBurn, setAmountToBurn] = useState('0.0000')
    const [msg, setMsg] = useState('')
    const [success, setSuccess] = useState(false)
    const [, setError] = useState(false)
    const [disableBtn, setDisableBtn] = useState(false)
    const [burnBtnText, setBurnBtnText] = useState('BURN TOKENS')

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

            const isBurner = await hasRole(account, BURNER_ROLE, provider)
            if (!isBurner) {
                setOpen(true)
                setError(true)
                setMsg('Only wallets with the burner role can burn tokens.')
            } else if (amountToBurn > 0) {
                setGlobalState('loading', true)
                setDisableBtn(true)
                setBurnBtnText('BURNING TOKENS')

                const transactionResponse = await burnTokens(account, parseUnits(amountToBurn, 4), signer)
                await transactionResponse.wait()

                setOpen(true)
                setSuccess(true)
                setMsg(`Burned ${amountToBurn} tokens successfully!`)
                updateBalance(account, provider)
                updateTotalSupply(provider)
                setGlobalState('loading', false)
                setAmountToBurn("0.0000")
                setDisableBtn(false)
                setBurnBtnText('BURN TOKENS')
            } else {
                setOpen(true)
                setError(true)
                setMsg('Cannot burn 0 tokens.')
            }
        } catch (e) {
            console.error(e)
            setDisableBtn(false)
            setBurnBtnText('BURN TOKENS')
            setGlobalState('loading', false)
        }
    }

    const handleChange = (event) => {
        setAmountToBurn(event.target.value)
    }

    const handleInput = (event) => {
        limitDecimalPlaces(event, 4)
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
                    BURN TOKENS
                </Typography>
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
                        label='Amount'
                        id='outlined-start-adornment'
                        sx={{ width: '100%' }}
                        value={amountToBurn}
                        onChange={handleChange}
                        onInput={handleInput}
                        inputMode='decimal'
                        InputProps={{
                            type: 'number',
                            endAdornment: <InputAdornment position='end'>NOK</InputAdornment>,
                            style: inputProps
                        }}
                    />
                </Box>
                <Button disabled={disableBtn} style={{ color: 'white' }} className='button button-primary button-wide-mobile' wide onClick={handleClick}>{burnBtnText}</Button>
            </CardContent>
        </Card>
    )
}

export default BurnTokens