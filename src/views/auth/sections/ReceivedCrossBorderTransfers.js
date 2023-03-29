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
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'
import Button from '../../../components/elements/Button'
import Image from '../../../components/elements/Image'
import { lookupAddressName } from '../../../utils/address'
import { useGlobalState, setGlobalState } from '../../../state'
import { withdraw } from '../../../hooks/useHTLC'
import { unitsToAmount } from '../../../utils/currency'
import { getHashedTimeLockContract } from '../../../hooks/useHTLC'

const cardStyle = {
    boxShadow: 0,
    borderRadius: 0,
}
const pollIntervalSeconds = 5
const transferStatuses = {
    WITHDRAWN: "Completed",
    REFUNDED: "Refunded",
    UNLOCKABLE: "Unlockable",
    EXPIRED: "Expired",
}

const ReceivedCrossBorderTransfers = () => {
    const sourceCurrency = 'NOK'
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
    const [hasInitializedRows, setHasInitializedRows] = useState(false)

    const handlePageChangedEvent = (event, newPage) => {
        setPage(newPage)
    }

    const handleRowsPerPageChangedEvent = (event) => {
        setRowsPerPage(+event.target.value)
        setPage(0)
    }

    const generateMessageSignature = () => {
        const nowEpochMilliseconds = new Date().getTime()
        const nowEpochSeconds = Math.round(nowEpochMilliseconds / 1000)
        const nowEpochMinutes = Math.round(nowEpochSeconds / 60)
        return signer.signMessage(String(nowEpochMinutes))
    }

    const initRows = () => {
        setIsLoading(true)
        generateMessageSignature().then((signature) => {
            fetch(
                `/psp/secret/${account}`, 
                {
                    method: 'GET',
                    headers: {
                        'X-AUTH-SIG': signature
                    }
                }
            ).then(response => {
                if (!response.ok) throw Error('something went wrong, please try again')
                return response.json()
            }).then(async (responseBody) => {
                const rows = []
                for await (const item of responseBody) {
                    if (!item.lockContract) continue
                    const row = await createNewRow(item)
                    rows.push(row)
                }
                setTableRows(rows)
                setHasInitializedRows(true)
                setIsLoading(false)
            }).catch((error) => {
                console.error(error.message)
                setIsLoading(false)
                setAlertOpen(true)
                setAlertError(true)
                setAlertSuccess(false)
                setAlertMessage('Failed to fetch received transfers, please reload the page')
            })
        })
    }

    const refreshRows = () => {
        const existingRowsByPaymentId = {}
        for (const existingRow of tableRows) {
            existingRowsByPaymentId[existingRow.paymentId] = existingRow
        }

        generateMessageSignature().then((signature) => {
            fetch(
                `/psp/secret/${account}`,
                {
                    method: 'GET',
                    headers: {
                        'X-AUTH-SIG': signature
                    }
                }
            ).then(response => {
                if (!response.ok) throw Error('something went wrong, please try again')
                return response.json()
            }).then(async (responseBody) => {
                const rows = []
                for await (const item of responseBody) {
                    if (!item.lockContract) continue
                    let row = existingRowsByPaymentId[item.paymentId]
                    if (!row) {
                        row = await createNewRow(item)
                    }
                    else if (!row.isFinalized && row.isValid) {
                        await updateRowStatus(row)
                    }
                    rows.push(row)
                }
                setTableRows(rows)
            }).catch((error) => {
                console.error(error.message)
            })
        })
    }

    const createNewRow = async (item) => {
        const row = {
            'paymentId': item.paymentId,
            'contractId': item.lockContract,
            'secret': item.secret,
            'amount': unitsToAmount(item.amount, sourceCurrency),
            'createdAt': new Date(item.createdAt),
            'lockedUntil': null,
            'status': null,
            'isFinalized': false,
            'isValid': true,
        }
        await updateRowStatus(row)
        return row
    }

    const updateRowStatus = async (row) => {
        const contract = await fetchContract(row.contractId)
        if (!contract) {
            console.debug('invalid row')
            row.isValid = false
            return 
        }

        const timeLockEpochSeconds = contract.timelock
        const isWithdrawn = contract.withdrawn
        const isRefunded = contract.refunded
        const lockedUntil = new Date(timeLockEpochSeconds * 1000)
        const isUnlockable = lockedUntil > new Date()

        if (!row.lockedUntil) {
            row.lockedUntil = lockedUntil
        }
        row.status = isWithdrawn ? transferStatuses.WITHDRAWN : isRefunded ? transferStatuses.REFUNDED : isUnlockable ? transferStatuses.UNLOCKABLE : transferStatuses.EXPIRED
        row.isFinalized = (isWithdrawn || isRefunded) ? true : false
    }

    const fetchContract = async (contractId) => {
        const contract = await getHashedTimeLockContract(contractId, provider)
        if (isInvalidHTLC(contract)) return null
        return contract
    }

    const isInvalidHTLC = (htlc) => {
        const invalidHtlcStr = "0x0000000000000000000000000000000000000000"
        if (
            htlc[0] === invalidHtlcStr && 
            htlc[1] === invalidHtlcStr && 
            htlc[2] === invalidHtlcStr
        ) {
            return true
        }
        return false
    }

    useEffect(() => {
        if (signer) initRows()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signer])

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (account) refreshRows()
        }, pollIntervalSeconds * 1000)
        return () => clearInterval(intervalId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasInitializedRows])

    const handleUnlockButtonClick = async (contractId, secret) => {
        const contract = await getHashedTimeLockContract(contractId, provider)
        if (contract.withdrawn) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(`The transfer you tried to unlock is already unlocked.`)
            return
        }
        if (contract.refunded) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(`The transfer you tried to unlock is already refunded.`)
            return
        }

        const timeLockEpochSeconds = contract.timelock
        const lockedUntil = new Date(timeLockEpochSeconds * 1000)
        const isTimelockExpired = lockedUntil <= new Date()
        if (isTimelockExpired) {
            setAlertOpen(true)
            setAlertSuccess(false)
            setAlertError(true)
            setAlertMessage(`The timelock of the transfer you tried to unlock has expired.`)
            return
        }

        setGlobalState('loading', true)
        
        let preImage = secret
        if (!preImage.startsWith('0x')) {
            preImage = `0x${preImage}`
        }

        try {
            console.debug(`Calling HTLCERC20Withdraw(${contractId}, ${preImage})`)
            const withdrawTransaction = await withdraw(contractId, preImage, signer)
            await withdrawTransaction.wait()
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
        setAlertSuccess(true)
        setAlertError(false)
        setAlertMessage('Received transfer was successfully unlocked')
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
                    RECEIVED CROSS BORDER TRANSFERS
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
                <TableContainer sx={{ minHeight: 440, maxHeight: 440}}>
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
                            {tableRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => row.isValid && (
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
                                        {row.status === transferStatuses.UNLOCKABLE && (
                                            <Button 
                                                disabled={false}
                                                style={{ color: 'white', width: '80%' }} 
                                                className='button button-primary button-wide-mobile' 
                                                wide 
                                                onClick={() => {
                                                    handleUnlockButtonClick(row.contractId, row.secret)
                                                }}
                                            >
                                                UNLOCK
                                            </Button>
                                        )}
                                        {row.status !== transferStatuses.UNLOCKABLE && (
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

export default ReceivedCrossBorderTransfers