FROM node:16-slim

WORKDIR /src/app
RUN apt-get update -y && apt-get install git -y && npm i --save-dev -g typescript
COPY package.json .

RUN npm i

COPY . .

ENTRYPOINT [ "npm", "run", "run" ]
