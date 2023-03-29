import { ethers } from 'ethers'

export const SUPPORTED_NETWORK = {
    chainId: '0x6C1',
    chainName: 'Bergen',
    rpcUrl: `${window.location.origin}/rpc`,
    blockExplorerUrl: `${window.location.origin}/blockscout/`
}

console.log(SUPPORTED_NETWORK.rpcUrl)

export const connectionInfo = {
    url: SUPPORTED_NETWORK.rpcUrl,
    user: process.env.REACT_APP_RPC_AUTH_USERNAME,
    password: process.env.REACT_APP_RPC_AUTH_PASSWORD
}

export const CONTRACT_CALL_SIGNATURE = {
    burn: '0x9dc29fac',
    transfer: '0xa9059cbb',
    mint: '0x40c10f19'
}

export const TOKEN_ADDRESS = '0x6749374B18A571193138251EB52f7a9B4fC5524e'
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// RBAC roles on the token contract
export const BURNER_ROLE = ethers.utils.id('BURNER_ROLE')
export const MINTER_ROLE = ethers.utils.id('MINTER_ROLE')

export const HTLC_ADDRESS = process.env.REACT_APP_HTLC_CONTRACT_ADDRESS
