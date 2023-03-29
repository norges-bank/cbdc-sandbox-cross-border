# CBDC Sandbox - Cross Border Payments
This project was forked from [cbdc-sandbox-frontend](https://github.com/norges-bank/cbdc-sandbox-frontend) 
and further developed to explore the Cross Border Payment use-case as part of Project Icebreaker.

## Disclaimer

This a sandbox project and not intended for production; use at your own risk.

## Running locally

### Installation

To run the frontend locally, simply run:
```sh
$ git clone git@github.com:norges-bank/cbdc-sandbox-cross-border.git
$ cd cbdc-sandbox-cross-border
$ npm install
$ cd compose/backend/fxp && npm install && cd ../../..
$ cd compose/backend/hub && npm install && cd ../../..
$ cd compose/backend/psp && npm install && cd ../../..
```

### Wallet Configuration

- Add 2 wallet files to the `compose/backend/fxp/wallets` directory with file-names `fxp1.json` and `fxp2.json`. 
- Set 2 environment variables `NO_FXP1_WALLET_ADDRESS` and `NO_FXP2_WALLET_ADDRESS` for the mocked HUB in `docker-compose.override.yml` to the 2 wallet addresses matching the wallet files

### Environment Variables

Configure the following environment variables in `docker-compose.yml` and `docker-compose.override.yml`:
- frontend:
    - `REACT_APP_HUB_REQUEST_HEADER`
    - `REACT_APP_HTLC_CONTRACT_ADDRESS`
    - `REACT_APP_SENDER_HOST`
- FXP1:
    - `PORT`
    - `FXP_ID`
    - `FXP_BASE_URL`
    - `HUB_URL`
    - `HUB_REQUEST_HEADER`
    - `FX_API_BASE_URL`
    - `JSON_RPC_PROVIDER_URL`
    - `HTLC_CONTRACT_ADDRESS`
- FXP2:
    - `PORT`
    - `FXP_ID`
    - `FXP_BASE_URL`
    - `HUB_URL`
    - `HUB_REQUEST_HEADER`
    - `FX_API_BASE_URL`
    - `JSON_RPC_PROVIDER_URL`
    - `HTLC_CONTRACT_ADDRESS`
- PSP:
    - `PORT`
    - `JSON_RPC_PROVIDER_URL`
    - `HTLC_CONTRACT_ADDRESS`
- nginx:
    - `FRONTEND_URL`
    - `FXP1_URL`
    - `FXP2_URL`
    - `PSP_URL`
    - `HUB_URL`
    - `JSON_RPC_PROVIDER_URL`
    - `BLOCKSCOUT_URL`
- HUB:
    - `PORT`
    - `IS_PVPVP_ENABLED`
    - `NO_NOK_HOST`
    - `NO_FXP1_HOST`
    - `NO_FXP1_HOST_NAME`
    - `NO_FXP1_WALLET_ADDRESS`
    - `NO_FXP2_HOST`
    - `NO_FXP2_HOST_NAME`
    - `NO_FXP2_WALLET_ADDRESS`
    - `IL_FXP1_HOST_NAME`
    - `SE_FXP1_HOST_NAME`
    - `HUB_REQUEST_HEADER`
    - `HUB_RESPONSE_HEADER`

### Secrets

Create the following `.txt` files in the `/compose/secrets` directory (replace empty strings in the below commands with the appropriate values):
```sh
$ echo "" > compose/secrets/fxp1_wallet_password.txt
$ echo "" > compose/secrets/fxp2_wallet_password.txt
$ echo "" > compose/secrets/rpc_header.txt
$ echo "" > compose/secrets/rpc_password.txt
$ echo "" > compose/secrets/rpc_user.txt
```

### Starting the dev servers

Run the following command to start the development servers:
```sh
$ docker-compose up --build --force-recreate
```

By default, the React app should start running on [localhost:8080](http://localhost:8080/).

### Shutting down the dev servers

Run the following command to shut down the development servers:
```sh
$ docker-compose down
```
