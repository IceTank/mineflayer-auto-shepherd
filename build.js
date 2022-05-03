const package = require('./package.json')
const { execSync } = require('child_process')
const dotenv = require('dotenv')
dotenv.config('./.build-env')

const version = package.version
const imageName = package.name

if (!version) {
  console.info('Invalid version in package.json')
  process.exit(1)
}

async function init() {
  const cmd0 = `git pull`
  console.info(cmd0)
  execSync(cmd0)
  const cmd1 = `docker build -t ${imageName} .`
  console.info(cmd1)
  execSync(cmd1)
  const cmd2 = `docker save ${imageName} -o ${imageName}-${version}.tar`
  console.info(cmd2)
  execSync(cmd2)
  const cmd3 = `scp ./${imageName}-${version}.tar ${process.env.REMOTE_USER}:${process.env.REMOTE_PATH}`
  console.info(cmd3)
  execSync(cmd3)
}

init().catch(console.error)
