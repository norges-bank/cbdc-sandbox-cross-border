FROM node:16 as builder
ARG ENV=development

WORKDIR /app

COPY ./psp_api.js psp_api.js

COPY ./package.json package.json
COPY ./global_config.js global_config.js
COPY ./abi abi
COPY ./json-schema json-schema

RUN mkdir /app/db
RUN npm install
