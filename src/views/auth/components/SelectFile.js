import React, { useRef } from 'react'
import { CardContent, CardActions, Typography, Grid, Box } from '@mui/material'
import Button from '../../../components/elements/Button'

const SelectFile = (props) => {
    const { onReceiveFile, onBack, error, setError } = props
    //creating the useref references for the uploads
    const keystoreFileRef = useRef(null)

    const handleKeystoreFileChange = (event) => {
        const fileUploaded = event.target.files[0]
        fileUploaded.text().then(text => {
            setError(false)
            onReceiveFile(text)
        })
    }

    const handleKeystoreFileClick = () => {
        keystoreFileRef.current.click()
    }

    return (
        <Box>
            <CardContent sx={{}}>
                <Typography id='modal-modal-title' variant='p' sx={{ fontWeight: 'bold', fontSize: '15px', color: '#153443' }}>
                    SELECT YOUR KEYSTORE FILE</Typography><br />
                <Typography variant='p' sx={{ fontWeight: 'bold', fontSize: '13px', color: '#153443' }}>
                    Select keystore file that unlocks your wallet</Typography>
                {error ?
                    <Typography variant='p' sx={{ fontWeight: 'bold', fontSize: '13px', color: '#FF6171' }}>
                        <br />Please select a valid keystore file.</Typography> : ''}
            </CardContent>
            <CardActions sx={{ p: 2 }}>
                <Grid container spacing={3}>
                    <Grid item xs={4} sm={4} md={4}>
                        <Button sx={{ width: '100%' }} className='keystore-button' wide onClick={onBack}>BACK</Button>
                    </Grid>
                    <Grid item xs={8} sm={8} md={8}>
                        <Button sx={{ width: '100%' }} onClick={handleKeystoreFileClick} className='button button-primary button-wide-mobile' wide>SELECT FILE</Button>
                        <input
                            type='file'
                            ref={keystoreFileRef}
                            onChange={handleKeystoreFileChange}
                            style={{ display: 'none' }}
                        />
                    </Grid>
                </Grid>
            </CardActions>
        </Box>
    )
}

export default SelectFile