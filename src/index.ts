import * as mineflayer from "mineflayer"
import dotenv from "dotenv"
import { Movements, pathfinder } from "mineflayer-pathfinder"
const mineflayerViewer = require('prismarine-viewer').mineflayer
import autoeat from "mineflayer-auto-eat";
import MinecraftData from "minecraft-data";
import { once } from "events";
// @ts-ignore
import inventoryViewer = require('mineflayer-web-inventory')
const wait = require('util').promisify(setTimeout)
dotenv.config()
import { makeBot } from "mineflayer-proxy-inspector";
import { inject as autoShepherdPlugin } from "./plugins/autoShepherd";
import path from "path";
import { promises as fs } from "fs";
import readline from "readline";

const chatLog = path.join(__dirname, '../chat.txt')
const nmpCache = path.join(__dirname, '../nmp-cache')
console.info('Chat log:', chatLog)

console.info('Nmp cache', nmpCache)

let bot: mineflayer.Bot

async function init() {
  const conn = makeBot({
    host: process.env.MCHOST,
    username: process.env.MCUSERNAME as string,
    password: process.env.MCPASSWORD,
    auth: 'microsoft',
    profilesFolder: nmpCache,
    version: '1.12.2'
  })
  
  // const conn = makeBot({
  //   host: 'localhost',
  //   username: 'TestBot',
  //   // password: process.env.MCPASSWORD,
  //   version: '1.12.2'
  // })

  let afkIntervalHandle: NodeJS.Timer | undefined = undefined;
  let actionTimeout: NodeJS.Timer | undefined;
  
  const resetActionTimeout = () => {
    if (actionTimeout) clearTimeout(actionTimeout)
    actionTimeout = setTimeout(() => {
      console.info('Disconnect due to stuck')
      bot.end()
    }, 120000)
  }

  const handleReconnect = () => {
    console.info('Restarting in 30sec')
    setTimeout(() => {
      init()
        .catch(console.error)
    }, 30000)
  }
    
  bot = conn.bot
  bot.on('error', console.error)
  bot.on('kicked', (reason) => console.info('Kicked for reason', reason))
  bot.on('end', handleReconnect)
  bot.on('message', (chatMessage) => {
    // console.info(chatMessage.toAnsi())
    fs.appendFile(chatLog, chatMessage.toString() + '\n')
      .catch(console.error)
  })

  bot.loadPlugins([pathfinder, autoeat, autoShepherdPlugin])
  
  // @ts-ignore
  bot.autoEat.disable()

  await once(bot, 'spawn')

  resetActionTimeout()
  if (process.env.VIEWER === 'true') mineflayerViewer(bot, { port: 3000 })
  if (process.env.INV === 'true') inventoryViewer(bot, { port: 3001 })
  console.info('Spawned')
  const mcData = MinecraftData(bot.version)

  const defaultMovement = new Movements(bot, mcData)
  defaultMovement.canDig = false
  defaultMovement.scafoldingBlocks = []
  defaultMovement.allowSprinting = false
  bot.pathfinder.setMovements(defaultMovement)
  // @ts-ignore
  bot.autoEat.options.priority = "foodPoints"
  // @ts-ignore
  bot.autoEat.options.bannedFood = []
  // @ts-ignore
  bot.autoEat.options.eatingTimeout = 3

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  afkIntervalHandle = setInterval(() => {
    bot.swingArm(undefined)
  }, 15000)

  bot.on('end', () => {
    console.info('Disconnected')
    if (afkIntervalHandle) clearInterval(afkIntervalHandle)
    if (actionTimeout) clearTimeout(actionTimeout)
    // @ts-ignore
    if (bot.viewer?.close) bot.viewer.close()
    rl.close()
    bot.autoShepherd.stopSheering()
    bot.removeAllListeners()
  })
  
  bot.on('health', async () => {
    if (bot.health < 10) {
      console.warn('Took to much damage logging off')
      process.exit(1)
    }
    // @ts-ignore
    if (bot.food < 16 && ! bot.autoEat.isEating) {
      await bot.autoShepherd.stopSheering()
      console.info('Starting to eat')
      await new Promise<void>((resolve) => {
        // @ts-ignore
        bot.autoEat.eat((err: Error) => {
          if (err) console.error(err)
          resolve()
        })
      })
      bot.autoShepherd.startSheering()
    }
  })

  bot.autoShepherd.emitter.on('cycle', () => {
    resetActionTimeout()
  })

  rl.on('line', (line) => {
    line = line.trim()
    if (line === 'start') {
      bot.autoShepherd.startSheering()
      return
    } else if (line === 'stop') {
      bot.autoShepherd.stopSheering()
    } else if (line === 'test') {
      console.info(conn.receivingPclients.length)
    } else if (line === 'deposit') {
      bot.autoShepherd.stopSheering().then(async () => {
        await bot.autoShepherd.depositItems()
        bot.autoShepherd.startSheering()
      })
    }
  })

  rl.on('SIGINT', () => {
    bot.removeListener('end', handleReconnect)
    setInterval(() => bot.end())
  })

  bot.autoShepherd.startSheering()
}

init()