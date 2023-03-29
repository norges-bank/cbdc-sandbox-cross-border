FROM node:16 as builder
ARG ENV=development

WORKDIR /app

COPY ./hub_api.js hub_api.js

COPY ./package.json package.json

COPY ./json-schema json-schema

RUN mkdir /app/db
RUN npm install
