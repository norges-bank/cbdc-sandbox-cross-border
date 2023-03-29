import fs from 'fs';

const _minutes = 60

const LOCK_MAX_DURATION_MILLISECONDS = () => {
    try {
        const readBuffer = fs.readFileSync("lockDuration.txt", 'utf8').replace(/\D/g,'')
        const minutes = parseInt(readBuffer)
        console.log(`Returning lockMaxDuration=${minutes} minutes (read from file)`)
        return minutes * 60 * 1000
    } catch (error) {
        console.log(`Failed to read lockMaxDuration config from file, defaulting to ${_minutes} minutes`)
        return _minutes * 60 * 1000
    }
}

export default LOCK_MAX_DURATION_MILLISECONDS