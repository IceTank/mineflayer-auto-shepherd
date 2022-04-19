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

let disconnectCooldown = 0
let maxDisconnectCooldown = 10 * 60 * 1000 // 10 minutes
let lastDisconnect = 0

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
  let lastAction = 0
  const watchdogTimeout = 60 * 4 * 1000

  const initWatchdog = () => {
    lastAction = Date.now()
    actionTimeout = setInterval(() => {
      const now = new Date()
      if (now.getTime() - lastAction > watchdogTimeout) {
        console.info('Disconnect due to stuck', now.toLocaleTimeString())
        console.info('Last actions', bot.autoShepherd.lastActions)
        bot.end()
      }
    }, watchdogTimeout)
  }
  
  const resetActionTimeout = () => {
    bot.autoShepherd.addLastAction('watchdog trigger')
    lastAction = Date.now()
  }

  const handleReconnect = () => {
    const now = Date.now()
    if (now - lastDisconnect < 60 * 1000) {
      disconnectCooldown += 30_000
      disconnectCooldown = Math.min(disconnectCooldown, maxDisconnectCooldown)
    } else {
      disconnectCooldown = 0
    }
    lastDisconnect = now
    console.info(`Disconnected. Restarting in ${30 + Math.floor(disconnectCooldown / 1000)}sec`)
    setTimeout(() => {
      init()
        .catch(console.error)
    }, 30000 + disconnectCooldown)
  }
  
  let lastQueuePosition = 0

  // @ts-ignore-error
  bot = conn.bot
  bot.on('error', console.error)
  bot.on('kicked', (reason) => console.info('Kicked for reason', reason))
  bot.on('end', handleReconnect)
  bot.on('message', (chatMessage) => {
    const chatString = chatMessage.toString()
    if (chatString.startsWith('Position in queue:')) {
      try {
        const match = chatString.match(/(\d+)/)
        if (!match) return
        const num = Number(match[0])
        if (isNaN(num)) return
        if ((num < 10 && num < lastQueuePosition) || (num <= Math.floor(lastQueuePosition / 10) * 10) || lastQueuePosition === 0) {
          lastQueuePosition = num
          console.info('Queue position', num)
        }
      } catch (err) {
        
      }
    }
    fs.appendFile(chatLog, chatString + '\n')
      .catch(console.error)
  })

  bot.loadPlugins([pathfinder, autoeat, autoShepherdPlugin])
  
  // @ts-ignore
  bot.autoEat.disable()

  // Wait for the bot to spawn. Also works for the 2b2t queue
  await once(bot, 'spawn')

  initWatchdog()
  if (process.env.VIEWER === 'true') mineflayerViewer(bot, { port: 3000 })
  if (process.env.INV === 'true') inventoryViewer(bot, { port: 3001 })
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
    if (actionTimeout) clearInterval(actionTimeout)
    // @ts-ignore
    if (bot.viewer?.close) bot.viewer.close()
    rl.close()
    bot.autoShepherd.stopSheering()
    bot.removeAllListeners()
  })
  
  bot.on('health', async () => {
    if (bot.health < 18) {
      console.warn('Took to much damage logging off')
      bot.autoShepherd.logResults()
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
    } else if (line === 'craft') {
      console.info('Crafting shears')
      bot.autoShepherd.craftShears()
        .then(result => console.info('Result', result))
        .catch(console.error)
    } else if (line === 'deposit') {
      bot.autoShepherd.stopSheering()
        .then(() => bot.autoShepherd.depositItems())
        .then(() => bot.autoShepherd.startSheering())
        .catch(console.error)
    } else if (line === 'quit' || line === 'exit') {
      exitBot()
    }
  })

  function exitBot() {
    console.info('Exiting')
    bot.autoShepherd.stopSheering()
      .then(() => bot.autoShepherd.depositItems())
      .then(() => bot.autoShepherd.logResults())
      .then(() => process.exit(0))
      .catch(console.error)
  }

  rl.on('SIGINT', () => {
    bot.removeListener('end', handleReconnect)
    exitBot()
  })

  bot.autoShepherd.startSheering()
}

// Catch MaxListenersExceededWarning
process.on('warning', (warning) => {
  console.warn(warning.message)
  console.warn(warning.stack)
})

init()