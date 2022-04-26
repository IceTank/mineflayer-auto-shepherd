FROM node:16-slim as build
WORKDIR /src/app
RUN apt-get update -y && apt-get install git -y && npm i --save-dev -g typescript
COPY package.json .
COPY tsconfig.json .

RUN npm i
COPY . .
RUN npm run build

FROM node:16-slim

WORKDIR /src/app
COPY --from=build /src/app/dist dist
COPY --from=build /src/app/node_modules node_modules
COPY --from=build /src/app/package.json .

ENTRYPOINT [ "npm", "run", "run" ]
