import { Contract, constants } from 'ethers'
import { isAddress } from './address'

/**
 * Function that instantiates a smart contract connection.
 * @param {string} address The smart contract address.
 * @param {string} ABI The smart contract application binary interface.
 * @param {Web3Provider} provider The provider to connect to the smart contract with.
 * @returns Contract object
 */
export const getContract = (address, ABI, provider) => {
    if (address === constants.AddressZero || !isAddress(address)) {
        throw Error(`Invalid address: ${address}`)
    }
    // TODO: Make it possible to accept both providers and signers.
    return new Contract(address, ABI, provider)
}