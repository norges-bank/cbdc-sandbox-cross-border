FROM node:16 as builder
ARG ENV=development

WORKDIR /app

COPY ./fxp_api.js fxp_api.js
COPY ./wallets wallets

COPY ./package.json package.json
COPY ./global_config.js global_config.js
COPY ./abi abi
COPY ./json-schema json-schema

RUN mkdir /app/db
RUN npm install
