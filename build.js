const package = require('./package.json')
const { exec } = require('child_process')
const dotenv = require('dotenv')
const { once } = require('events')
const path = require('path')
dotenv.config({
  path: path.join(__dirname, '.build-env')
})

const version = package.version
const imageName = package.name

if (!version) {
  console.info('Invalid version in package.json')
  process.exit(1)
}

async function runCmd(command) {
  console.info(command)
  const process = exec(command)
  process.stdout.on('data', data => {
    console.log(data)
  })
  process.stderr.on('data', data => {
    console.error(data)
  })
  await once(process, 'exit')
}

async function init() {
  const cmd0 = `git pull`
  await runCmd(cmd0)
  const cmd1 = `docker build -t ${imageName} .`
  await runCmd(cmd1)
  const cmd2 = `docker save ${imageName} -o ${imageName}-${version}.tar`
  await runCmd(cmd2)
  const cmd3 = `scp ./${imageName}-${version}.tar ${process.env.REMOTE_USER}@${process.env.REMOTE_ADDRESS}:${process.env.REMOTE_PATH}`
  await runCmd(cmd3)
}

init().catch(console.error)
