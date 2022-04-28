## Automatic sheep farm bot for 2b2t
Automatically shears sheep and put the wool into nearby chests that have a wool block below them. Crafts shears from iron in the bots inventory. 
Ideal setup is a closed space with grass for the sheep to regrow there wool on there own. The bot cannot defend itself and will log off when it takes damage.

## Features
- Automatic shearing off nearby sheep
- Auto eat
- Automatic shear crafting and wool depositing
- Auto queueing and auto reconnect
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

## pm2 start
`pm2 start npm --no-autorestart -- run run`

## Docker
### Build docker image
`docker build . -t mineflayer-auto-shepherd`

### Launch docker image
`docker run --rm -itd -v $(pwd)/nmp-cache:/src/app/nmp-cache --name mineflayer-auto-shepherd mineflayer-auto-shepherd`
`docker run --rm -it -v $(pwd)/nmp-cache:/src/app/nmp-cache --name mineflayer-auto-shepherd mineflayer-auto-shepherd`

### View logs
`docker logs -f mineflayer-auto-shepherd`
