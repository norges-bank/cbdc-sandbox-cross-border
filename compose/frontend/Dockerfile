# Build stage
FROM node:16 as builder
ARG ENV=development
WORKDIR /app

ENTRYPOINT [ "sh" ] 
CMD [ "-c", "npm install && npm start" ]