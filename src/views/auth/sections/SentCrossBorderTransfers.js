import React, { useEffect, useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import TableContainer from '@mui/material/TableContainer'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import TableFooter from '@mui/material/TableFooter'
import TablePagination from '@mui/material/TablePagination'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'
import Button from '../../../components/elements/Button'
import Image from '../../../components/elements/Image'
import { lookupAddressName } from '../../../utils/address'
import { useGlobalState, setGlobalState } from '../../../state'
import { refund, getNewContractEventsBySender, getHashedTimeLockContract } from '../../../hooks/useHTLC'
import { unitsToAmount } from '../../../utils/currency'

const cardStyle = {
    boxShadow: 0,
    borderRadius: 0,
}
const pollIntervalSeconds = 10
const transferStatuses = {
    WITHDRAWN: "Completed",
    REFUNDED: "Refunded",
    REFUNDABLE: "Refundable",
    LOCKED: "Locked",
}
const APPROX_NUM_BLOCKS_IN_24_HOURS = 17280

const SentCrossBorderTransfers = () => {
    const sourceCurrency = 'NOK'
    const [contractToPaymentMap] = useGlobalState('contractToPaymentMap')

    const [account] = useGlobalState('account')
    const [signer] = useGlobalState('signer')
    const [provider] = useGlobalState('provider')
    const [addressBook] = useGlobalState('addressBook')

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

    const [tableRows, setTableRows] = useState([])
    const [page, setPage] = useState(0)
    const [rowsPerPage, setRowsPerPage] = useState(5)
    const [isLoading, setIsLoading] = useState(false)

    const handlePageChangedEvent = (event, newPage) => {
        setPage(newPage)
    }

    const handleRowsPerPageChangedEvent = (event) => {
        setRowsPerPage(+event.target.value)
        setPage(0)
    }

    const initRows = async () => {
        setIsLoading(true)
        const startBlock = await getInitStartBlockNumber()
        const newRows = await loadNewRows(startBlock)
        setTableRows(newRows)
        setIsLoading(false)
    }

    const getInitStartBlockNumber = async () => {
        const currentBlockNumber = await provider.getBlockNumber()
        return currentBlockNumber - APPROX_NUM_BLOCKS_IN_24_HOURS
    }

    const refreshRows = async () => {
        const existingRows = tableRows
        await updateExistingRows(existingRows)
        const startBlock = await getRefreshStartBlockNumber(existingRows)
        const newRows = await loadNewRows(startBlock)
        const finalRows = newRows ? newRows.concat(existingRows) : existingRows
        setTableRows(finalRows)
    }

    const getRefreshStartBlockNumber = async (existingRows) => {
        if (existingRows.length > 0) {
            return existingRows[0].blockNumber + 1
        } else {
            const currentBlockNumber = await provider.getBlockNumber()
            return currentBlockNumber - APPROX_NUM_BLOCKS_IN_24_HOURS
        }
    }

    const updateExistingRows = async (existingRows) => {
        for await (const row of existingRows) {
            if (!row.isFinalized) {
                await updateRow(row)
            }
        }
    }

    const loadNewRows = async (startBlock) => {
        const newRows = []
        const newContractEvents = await getNewContractEventsBySender(provider, account, startBlock)
        if (!newContractEvents) {
            return []
        }
        for await (const newContractEvent of newContractEvents) {
            const contractId = newContractEvent.args?.contractId
            const timelock = newContractEvent.args?.timelock
            const lockedUntil = new Date(timelock * 1000)
            const blockNumber = newContractEvent.blockNumber
            const row = {
                'contractId': contractId,
                'paymentId': contractToPaymentMap[contractId],
                'amount': unitsToAmount(newContractEvent.args?.amount, sourceCurrency),
                'timelock': timelock,
                'lockedUntil': lockedUntil,
                'status': null,
                'blockNumber': blockNumber,
                'isFinalized': null
            }
            await updateRow(row)
            newRows.push(row)
        }
        newRows.sort((a, b) => b.blockNumber - a.blockNumber)
        return newRows
    }

    const updateRow = async (row) => {
        if (!row.paymentId) {
            row.paymentId = contractToPaymentMap[row.contractId]
        }
        const contract = await getHashedTimeLockContract(row.contractId, provider)
        const isRefundable = row.lockedUntil < new Date()
        row.status = contract.withdrawn ? transferStatuses.WITHDRAWN : contract.refunded ? transferStatuses.REFUNDED : isRefundable ? transferStatuses.REFUNDABLE : transferStatuses.LOCKED
        row.isFinalized = contract.withdrawn || contract.refunded
    }

    useEffect(() => {
        if (account) {
            initRows()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account])

    useEffect(() => {
        let timeoutId
        if (account && tableRows) {
            timeoutId = setTimeout(refreshRows, pollIntervalSeconds * 1000);
        }
        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableRows])

    const handleRefundButtonClick = async (contractId, timelock) => {
        const nowEpochSeconds = Math.floor(new Date() / 1000)
        const secondsUntilLockExpires = timelock - nowEpochSeconds
        if (secondsUntilLockExpires > 0) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(`You must wait ${secondsUntilLockExpires} seconds until the lock expires before you can be refunded`)
            return
        }

        const contract = await getHashedTimeLockContract(contractId, provider)
        if (contract.withdrawn) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(`The transfer you tried to refund is already completed.`)
            return
        }
        if (contract.refunded) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(`The transfer you tried to refund is already refunded.`)
            return
        }

        setGlobalState('loading', true)

        try {
            console.debug(`Calling HTLCERC20Refund(${contractId})`)
            const refundTransaction = await refund(contractId, signer)
            await refundTransaction.wait()
        } catch(e) {
            console.error(e)
            setGlobalState('loading', false)

            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(`Something went wrong, please try again`)
            return
        }

        setAlertOpen(true)
        setAlertError(false)
        setAlertSuccess(true)
        setAlertMessage('Transfer was successfully refunded')
        setGlobalState('loading', false)

        refreshRows()
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
                    SENT CROSS BORDER TRANSFERS
                </Typography>
                <Box sx={{ mt: 3 }}>
                    <Stack direction='row' spacing={2}>
                        <Image className='wallet-image' src={`https://avatars.dicebear.com/api/jdenticon/${account}.svg?r=50`} />
                        <Box className='neg-mt'>
                            <Typography variant='p' color='text.secondary' sx={{ fontSize: 12 }}>
                                WALLET
                            </Typography>
                            <Typography className='card-text' variant='h6'>
                                {account ? lookupAddressName(account, addressBook, true) : '-'}<span style={{ position: 'absolute' }}></span>
                            </Typography>
                        </Box>
                        <Box>
                            {isLoading && (
                                <CircularProgress style={{marginLeft: '50%'}}/>
                            )}
                        </Box>
                    </Stack>
                </Box>
                <TableContainer sx={{ minHeight: 440, maxHeight: 440 }}>
                    <Table stickyHeader aria-label="sticky table">
                        <TableHead>
                            <TableRow>
                                <TableCell><Typography color='text.secondary'>Payment ID</Typography></TableCell>
                                <TableCell><Typography color='text.secondary'>Amount</Typography></TableCell>
                                <TableCell><Typography color='text.secondary'>Timelock Expires At</Typography></TableCell>
                                <TableCell><Typography color='text.secondary'>Status</Typography></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {tableRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => (
                                <TableRow key={row.contractId} sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                                    <TableCell>
                                        <Typography variant='p' color='text.secondary'>
                                            {row.paymentId}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant='p' color='text.secondary'>
                                            {row.amount} {sourceCurrency}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant='p' color='text.secondary'>
                                            {row.lockedUntil ? row.lockedUntil.toLocaleString() : ''}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {row.status === transferStatuses.REFUNDABLE && (
                                            <Button 
                                                disabled={false}
                                                style={{ color: 'white', width: '80%' }} 
                                                className='button button-primary button-wide-mobile' 
                                                wide 
                                                onClick={() => {
                                                    handleRefundButtonClick(row.contractId, row.timelock)
                                                }}
                                            >
                                                REFUND
                                            </Button>
                                        )}
                                        {row.status !== transferStatuses.REFUNDABLE && (
                                            <Typography variant='p' color='text.secondary'>
                                                {row.status}
                                            </Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TablePagination
                                    rowsPerPageOptions={[5, 10, 15]}
                                    count={tableRows.length}
                                    rowsPerPage={rowsPerPage}
                                    page={page}
                                    onPageChange={handlePageChangedEvent}
                                    onRowsPerPageChange={handleRowsPerPageChangedEvent}
                                />
                            </TableRow>
                        </TableFooter>
                    </Table>
                </TableContainer>
            </CardContent>
        </Card>
    )
}

export default SentCrossBorderTransfers