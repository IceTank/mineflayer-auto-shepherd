## Automatic sheep farm bot for 2b2t

Automatically shears sheep and put's the wool into nearby chests that have a wool block below them. Crafts shears from iron in the bots inventory.
Ideal setup is a closed space with grass for the sheep to regrow there wool on there own. The bot cannot defend itself and will log off when it takes damage.

## Features

- Automatic shearing of nearby sheep
- Auto eat
- Automatic shear crafting and wool depositing
- Auto queueing and auto reconnect
- Integrated proxy to connect into the game as the bot account
- Web inventory viewer
- Web world viewer

## Installation

1. Install [Node.js](https://nodejs.org) version 14.17.0 or newer.
2. Install git for windows/mac/linux [Git](https://git-scm.com/downloads)
3. Install typescript and yarn `npm install --global typescript yarn`
4. Open a command propt and navigate to a folder where you want to save the app. Then run `git clone https://github.com/IceTank/mineflayer-auto-shepherd`
5. Change into the downloaded folder with `cd mineflayer-auto-shepherd`
6. Run `yarn install`
7. Create a file `.env` and fill it out with your account information according to the Environment variables listed below
8. Run it with `npm start`

### Environment variables (in .env)

- `MCUSERNAME=` Microsoft Email for the account to be used.
- `MCHOST=` Host (Should be `connect.2b2t.org` for 2b).
- `MCPASSWORD=` Optional. You can authenticate via microsoft auth when not providing a password by following the steps in the terminal output.
- `VIEWER=` `true`|`false`. Optional. Set if the browser world viewer should be used. Default to `true`.
- `INV=` `true`|`false`. Optional. Set if the browser inventory viewer should be used. Default to `true`.
- `START_IDLE=` `true`|`false`. Optional. Start in mode idle or start in mode running. Default to `false`.
- `CONNECT_ON=` `number`. Optional. Unix timestamp in milliseconds. When the bot should connect to the server. When not provided starts immediately.
- `LOGOFFONDAMAGE=` `true`|`false`. Optional. Loges off when the bot takes damage. Defaults to `true`.
- `EATONHUNGER=` `true`|`false`. Optional. Tries to eat when low on food. Defaults to `true`.

## Usage

### Starting

After starting the bot with `npm run start` it will create it's own proxy server running on port 25566. You can join the proxy server with `localhost:25566` and see the bot working.
When you run this script on a server you can also connect to the proxy by using the server ip and port 25566. When running a docker container make sure to expose port 0.0.0.0:25566 on the host machine to be able to connect from outside off the network. Example: `-p 0.0.0.0:25566:25566` exposes port 25566 on all addresses when launching a container. Without this the docker container will only expose the port on the address range off 127.0.0.0 making it inaccessible from outside off the machine.

### In game usage

To take control off the proxy bot type `$link` in chat. To unlink type `$unlink` in chat.
The proxy implementation is not perfect. Entity states are not transferred correctly so map's and entities within render distance when joining the proxy will look wrong until you reload them.
If the START_IDLE variable is set the bot will try to not get kicked when joining the server. Altho this does not seam to be too effective at the moment. While running in sheering mode the bot can stay connect for up to 9 hours before getting kicked by the server.

### CONNECT_ON environment variable

The value can be either one off:

- Unix timestamp in the node.js format. (milliseconds resolution)
- `MM-DDTHH:mm` - Next Month, date, hour, minute as off local time
- `DDTHH` - Next Date and hour as off local time
- `DDTHH:mm` - Next Date, hour and minute as off local time
- `+HH:mm` - Offset as hour and minute in the future
- `+DD:HH:mm` Offset as day, hour and minute in the future

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
