## Environment variables (in .env)
MCUSERNAME - Username
MCPASSWORD - Password
MCHOST - Host
VIEWER - Set if the browser viewer should be used
INV - Set if the inventory viewer should be used

## Build docker image
`docker build . -t mineflayer-auto-shepherd`

## Launch docker image
`docker run --rm -itd -v ${pwd}/nmp-cache:/src/app/nmp-cache --name mineflayer-auto-shepherd -p 25565:25566 -p 3001:3001 mineflayer-auto-shepherd`

## View logs
`docker logs -f mineflayer-auto-shepherd`
