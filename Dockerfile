FROM node:16-slim

WORKDIR /src/app
RUN apt-get update -y && apt-get install git -y && npm i --save-dev -g typescript
COPY package.json .
COPY tsconfig.json .

RUN npm i
COPY . .
RUN npm run build

ENTRYPOINT [ "npm", "run", "run" ]
