import React, { useEffect, useState } from 'react'
import { Box, Typography, Modal, CardActions, Backdrop, Card, CardContent, TextField } from '@mui/material'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import Button from '../../../components/elements/Button'
import { appendItemByAddress, retrieveItem } from '../../../utils/localStorage'
import { setGlobalState } from '../../../state'

const RenameAddress = (props) => {
    const { address, name, onClose, open } = props
    const [addressName, setAddressName] = useState('')

    const handleSaveAddress = () => {
        appendItemByAddress('addressBook', address, { address, addressName })
        setGlobalState('addressBook', retrieveItem('addressBook'))
        onClose()
    }

    const handleChange = (event) => {
        setAddressName(event.target.value)
    }

    useEffect(() => {
        setAddressName(name)
    }, [name])

    return (
        <Modal
            open={open}
            onClose={onClose}
            aria-labelledby='modal-modal-title'
            aria-describedby='modal-modal-description'
            closeAfterTransition
            BackdropComponent={Backdrop}
            BackdropProps={{
                timeout: 500,
            }}
        >
            <Box className='modal-box'>
                <Card>
                    <Box sx={{ mt: 2, p: 2, borderBottom: '1px solid #CBE5EE' }}>
                        <Typography id='modal-modal-title' variant='p' sx={{ pl: 2 }}>
                            RENAME <span style={{ float: 'right', cursor: 'pointer' }}><HighlightOffIcon onClick={onClose} /></span>
                        </Typography>
                    </Box>

                    <CardContent sx={{}}>
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
                                label='Address Name'
                                id='outlined-start-adornment'
                                sx={{ width: '100%' }}
                                value={addressName}
                                onChange={handleChange}
                            />
                        </Box>
                    </CardContent>
                    <CardActions sx={{ p: 2 }}>
                        <Button sx={{ width: '100%' }} onClick={handleSaveAddress} className='button button-primary button-wide-mobile' wide>SAVE ADDRESS NAME</Button>
                    </CardActions>
                </Card>
            </Box>
        </Modal>
    )
}

export default RenameAddress