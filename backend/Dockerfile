FROM node:20-alpine

RUN apk add --no-cache docker-cli bash

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
