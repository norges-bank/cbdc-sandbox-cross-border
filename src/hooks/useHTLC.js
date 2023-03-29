import HTLC_ABI from '../abis/htlc.json'
import { HTLC_ADDRESS } from '../constants'
import { getContract } from '../utils/contract'

export const newContract = async (receiver, hashLock, timeLock, tokenContract, amount, signer) => {
    const contract = getContract(HTLC_ADDRESS, HTLC_ABI, signer)
    const newContractResponseBody = await contract.newContract(receiver, hashLock, timeLock, tokenContract, amount)
    return newContractResponseBody
}

export const getHashedTimeLockContract = async (contractId, provider) => {
    const contract = getContract(HTLC_ADDRESS, HTLC_ABI, provider)
    const responseBody = await contract.getContract(contractId)
    return responseBody
}

export const hashLockContractExists = async(contractId, provider) => {
    const contract = getContract(HTLC_ADDRESS, HTLC_ABI, provider)
    const responseBody = await contract.haveContract(contractId)
    return responseBody
}

export const withdraw = async (contractId, preImage, signer) => {
    const contract = getContract(HTLC_ADDRESS, HTLC_ABI, signer)
    const responseBody = await contract.withdraw(contractId, preImage)
    return responseBody
}

export const refund = async (contractId, signer) => {
    const contract = getContract(HTLC_ADDRESS, HTLC_ABI, signer)
    const responseBody = await contract.refund(contractId)
    return responseBody
}

export const getNewContractEventsBySender = async (provider, sender, startBlockNumber) => {
    const contract = getContract(HTLC_ADDRESS, HTLC_ABI, provider)
    const queryResult = await contract.queryFilter(contract.filters.HTLCERC20New(null,  sender, null), startBlockNumber)
    return queryResult
}