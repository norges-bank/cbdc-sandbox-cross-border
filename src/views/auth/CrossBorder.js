import { useEffect, useState } from 'react'
import { Grid, Box } from '@mui/material'
import LayoutDefault from '../../layouts/LayoutDefault'
import Wallet from './sections/Wallet'
import CrossBorderTransfer from './sections/CrossBorderTransfer'
import ReceivedCrossBorderTransfers from './sections/ReceivedCrossBorderTransfers'
import SentCrossBorderTransfers from './sections/SentCrossBorderTransfers'
import SelectWalletModal from './elements/SelectWalletModal'
import { updateBalance, useGlobalState } from '../../state'
import { listenToContract } from '../../hooks/useContract'

const CrossBorder = () => {
    const [open, setOpen] = useState(false)
    const handleClose = () => setOpen(false)
    const [account] = useGlobalState('account')
    const [provider] = useGlobalState('provider')

    useEffect(() => {
        updateBalance(account, provider)
        provider.removeAllListeners()
        listenToContract(account, provider)

        return () => {
            provider.removeAllListeners()
        }
    }, [account])

    return (
        <LayoutDefault>
            {open ? (
                <SelectWalletModal open={open} onClose={handleClose} />
            ) : null}
            <Box className='container' sx={{ mt: 8, mb: 10 }}>
                <Grid container spacing={3} sx={{ mt: 5, mb: 5 }}>
                    <Grid item xs={12} md={12} sm={12}>
                        <Wallet />
                    </Grid>
                    <Grid item xs={12} md={12} sm={12}>
                        <CrossBorderTransfer />
                    </Grid>
                    <Grid item xs={12} md={12} sm={12}>
                        <SentCrossBorderTransfers />
                    </Grid>
                    <Grid item xs={12} md={12} sm={12}>
                        <ReceivedCrossBorderTransfers />
                    </Grid>
                </Grid>
            </Box>
        </LayoutDefault>
    )
}

export default CrossBorder