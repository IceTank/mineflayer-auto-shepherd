## Automatic sheep farm bot for 2b2t
Automatically shears sheep and put's the wool into nearby chests that have a wool block below them. Crafts shears from iron in the bots inventory. 
Ideal setup is a closed space with grass for the sheep to regrow there wool on there own. The bot cannot defend itself and will log off when it takes damage.

## Features
- Automatic shearing off nearby sheep
- Auto eat
- Automatic shear crafting and wool depositing
- Auto queueing and auto reconnect
- Integrated proxy to connect into the game as the bot account
- Web viewer off the bots inventory
- Web viewer off the bots surrounding world

## Installation
1. Install [Node.js](https://nodejs.org)
2. Install git for windows/mac/linux [Git](https://git-scm.com/downloads)
3. Git clone this repo by opening a command line tool and running `git clone https://github.com/IceTank/mineflayer-auto-shepherd`
4. Run `npm install`
5. Create a file `.env` and fill it out with your account information according to the Environment variables listed below
6. Run it with `npm start`

## Environment variables (in .env)
- `MCUSERNAME=` Microsoft Email
- `MCPASSWORD=` Password
- `MCHOST=` Host (Should be `connect.2b2t.org` for 2b)
- `VIEWER=` `true`|`false`. Set if the browser world viewer should be used
- `INV=` `true`|`false`. Set if the browser inventory viewer should be used
- `START_IDLE=` `true`|`false`. Start in mode idle or start in mode running
- `CONNECT_ON=` `number`. Unix timestamp in milliseconds. When the bot should connect to the server

## Usage 
After starting the bot with `npm run start` it will create it's own proxy server running on port 25566. You can join the proxy server with `localhost:25566` and see the bot working.

To take control off the proxy bot type `$link` in chat. To unlink type `$unlink` in chat. 
The proxy implementation is not perfect. Entity states are not transfered correctly so map's and entities within render distence when joining the proxy will look wrong until you reload them.
If the START_IDLE variable is set the bot will try to not get kicked when joining the server. Altho this does not seam to be too effective at the moment. While running in sheering mode the bot can stay connect for up to 9 hours before getting kicked by the server.

## pm2 start
`pm2 start npm --no-autorestart -- run run`

## Docker
### Build docker image
`docker build . -t mineflayer-auto-shepherd`

### Launch docker image
When connection from docker to localhost use host.docker.internal
Attached:
`docker run --rm -itd --env-file .env -v $(pwd)/nmp-cache:/src/app/nmp-cache -v $(pwd)/chat.txt:/src/app/chat.txt -p 0.0.0.0:25566:25566 -p 0.0.0.0:3000:3000 -p 0.0.0.0:3001:3001 --name mineflayer-auto-shepherd mineflayer-auto-shepherd`

Detached:
`docker run --rm -it --env-file .env -v $(pwd)/nmp-cache:/src/app/nmp-cache -v $(pwd)/chat.txt:/src/app/chat.txt -p 0.0.0.0:25566:25566 -p 0.0.0.0:3000:3000 -p 0.0.0.0:3001:3001 --name mineflayer-auto-shepherd mineflayer-auto-shepherd`

### View logs
`docker logs -f mineflayer-auto-shepherd`
