import React, { useState } from 'react'
import { CardContent, CardActions, Typography, Grid, Box, FormHelperText, OutlinedInput, FormControl, InputAdornment, IconButton } from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import Button from '../../../components/elements/Button'
import { setGlobalState, useGlobalState } from '../../../state'
import { ethers } from 'ethers'

const inputProps = {
    backgroundColor: '#F2F8FA',
    border: '0px',
    height: '30px',
    ariaLabel: 'weight',
}

const EnterPassword = (props) => {
    const { encryptedWallet, error, setError, onBack, onClose } = props

    const [provider] = useGlobalState('provider')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [btnText, setBtnText] = useState('ACCESS WALLET')

    const handleClickShowPassword = () => {
        setShowPassword(!showPassword)
    }

    const handleKeyPress = async (event) => {
        if (event.key === 'Enter') {
            await onDecryptWallet()
            event.preventDefault()
        }
    }

    const updatePassword = (event) => {
        setGlobalState('loading', false)
        setBtnText('ACCESS WALLET')
        setPassword(event.target.value)
        setError(false)
    }

    const onDecryptWallet = async () => {
        if (password === '') {
            setError(true)
        }
        setGlobalState('loading', true)
        setBtnText('ACCESSING WALLET...')
        try {
            let unlockedWallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password)
            unlockedWallet = unlockedWallet.connect(provider)
            setGlobalState('account', await unlockedWallet.getAddress())
            setGlobalState('signer', unlockedWallet)
            setBtnText('ACCESS WALLET')
            setGlobalState('loading', false)
            onClose()
        } catch (error) {
            setError(true)
            setBtnText('ACCESS WALLET')
            setGlobalState('loading', false)
        }
    }

    return (
        <Box>
            <CardContent sx={{}}>
                <Typography id='modal-modal-title' variant='p' sx={{ fontWeight: 'bold', fontSize: '15px', color: '#153443' }}>
                    ENTER PASSWORD</Typography><br />
                <Typography variant='p' sx={{ fontWeight: 'bold', fontSize: '13px', color: '#153443' }}>
                    Enter password to unlock your wallet</Typography>
                <Box
                    component='form'
                    sx={{
                        '& .MuiTextField-root': { width: '100%' },
                    }}
                    noValidate
                    autoComplete='off'
                    style={{ marginTop: '20px' }}
                >

                    <FormControl sx={{ width: '100%' }} variant='outlined'>
                        <OutlinedInput
                            autoFocus
                            id='outlined-adornment-password'
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={updatePassword}
                            onKeyDown={handleKeyPress}
                            placeholder='Enter keystore password'
                            size='small'
                            error={error}
                            inputProps={{ style: inputProps }}
                            endAdornment={
                                <InputAdornment position='end'>
                                    <IconButton
                                        aria-label='toggle password visibility'
                                        onClick={handleClickShowPassword}
                                        edge='end'
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            }
                        />
                        <FormHelperText id='component-error-text'>{error ? 'Wrong password.' : ''}</FormHelperText>
                    </FormControl>
                </Box>
            </CardContent>
            <CardActions sx={{ p: 2 }}>
                <Grid container spacing={3}>
                    <Grid item xs={4} sm={4} md={4}>
                        <Button sx={{ width: '100%' }} className='keystore-button' wide onClick={onBack}>BACK</Button>
                    </Grid>
                    <Grid item xs={8} sm={8} md={8}>
                        <Button sx={{ width: '100%' }} className='button button-primary button-wide-mobile' wide onClick={onDecryptWallet}>
                            {btnText}
                        </Button>
                    </Grid>
                </Grid>
            </CardActions>
        </Box>
    )
}

export default EnterPassword