import * as mineflayer from "mineflayer"
import dotenv from "dotenv"
import { pathfinder } from "mineflayer-pathfinder"
const mineflayerViewer = require('prismarine-viewer').mineflayer
import autoeat from "mineflayer-auto-eat";
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
const { default: fetch } = require('node-fetch');

const queueLengthAPI = 'https://2b2t.space/queue'

const chatLog = path.join(__dirname, '../chat.txt')
const nmpCache = path.join(__dirname, '../nmp-cache')
console.info('Chat log:', chatLog)
console.info('Nmp cache', nmpCache)

let bot: mineflayer.Bot

let disconnectCooldown = 0
let maxDisconnectCooldown = 10 * 60 * 1000 // 10 minutes
let lastDisconnect = 0

function ringConsoleBell() {
  console.info('\x07')
}

/*
{"updatedAt":1651519960629,"queueLength":361}
*/
interface QueueLengthAPIResponse {
  updatedAt: number
  queueLength: number
}

async function getQueueLength() {
  const response = await fetch(queueLengthAPI, {
    headers: {
      'User-Agent': 'Node-fetch auto-shepherd'
    }
  })
  const json = await response.json() as QueueLengthAPIResponse
  return json.queueLength
}

async function init() {
  const conn = makeBot({
    host: process.env.MCHOST,
    username: process.env.MCUSERNAME as string,
    password: process.env.MCPASSWORD,
    auth: 'microsoft',
    profilesFolder: nmpCache,
    version: '1.12.2',
    checkTimeoutInterval: 90_000
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
  let logNoneQueueChat = true
  let loginDate: Date | null = null
  let spawnAbortController = new AbortController()

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
    if ((now - lastDisconnect) + disconnectCooldown < 60 * 1000) {
      disconnectCooldown += 30_000
      disconnectCooldown = Math.min(disconnectCooldown, maxDisconnectCooldown)
    } else {
      disconnectCooldown = 0
    }
    lastDisconnect = now
    console.info(`Disconnected. Restarting in ${30 + Math.floor(disconnectCooldown / 1000)}sec`)
    if (loginDate) {
      const timeConnected = now - loginDate.getTime()
      // Log how long the bot was connected in hours and minutes
      console.info(`Bot was connected for ${Math.floor(timeConnected / 1000 / 60 / 60)}h ${Math.floor(timeConnected / 1000 / 60)}m`)
    }
    bot.removeAllListeners()
    spawnAbortController.abort()
    setTimeout(() => {
      init()
        .catch(console.error)
    }, 30000 + disconnectCooldown)
  }
  
  let lastQueuePosition = 0

  // @ts-ignore-error
  bot = conn.bot
  bot.on('login', () => {
    loginDate = new Date()
    console.info('Login with username', bot.username)
  })
  bot.on('error', console.error)
  bot.on('kicked', (reason) => console.info('Kicked for reason', reason))
  bot.on('end', handleReconnect)
  bot.on('message', (chatMessage) => {
    const chatString = chatMessage.toString()
    try {
      if (chatString.startsWith('Position in queue:')) {
        const match = chatString.match(/(\d+)/)
        if (!match) return
        const num = Number(match[0])
        if (isNaN(num)) return
        if ((num < 10 && num < lastQueuePosition) || (num < Math.floor(lastQueuePosition / 10) * 10) || lastQueuePosition === 0) {
          lastQueuePosition = num
          console.info('Queue position', num)
        }
      } else if (chatString.startsWith('Connecting to the server...')) {
        console.info(chatString)
        ringConsoleBell()
      } else if (logNoneQueueChat) {
        console.info(`> ${chatMessage.toString()}`)
      }
    } catch (err) {
      
    }
    fs.appendFile(chatLog, chatString + '\n')
      .catch(console.error)
  })

  bot.loadPlugins([pathfinder, autoeat, autoShepherdPlugin])
  
  // @ts-ignore
  bot.autoEat.disable()

  // Wait for the bot to spawn. Also works for the 2b2t queue.
  // Abort when the bot disconnects while in queue.
  try {
    await once(bot, 'spawn', {
      signal: spawnAbortController.signal
    })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return
    } else {
      console.error(err)
      return
    }
  }
  // ################## After spawn ##################

  logNoneQueueChat = false

  initWatchdog()
  if (process.env.VIEWER === 'true') mineflayerViewer(bot, { port: 3000 })
  if (process.env.INV === 'true') inventoryViewer(bot, { port: 3001 })
  if (process.env.START_IDLE === 'true') {
    bot.autoShepherd.switchMode('idle')
  } else {
    bot.autoShepherd.switchMode('running')
  }
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

  bot.autoShepherd.emitter.on('alive', () => {
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

  bot.autoShepherd.start()
}

// Catch MaxListenersExceededWarning
process.on('warning', (warning) => {
  console.warn(warning.message)
  console.warn(warning.stack)
})

async function connectWhenReady(date: Date) {
  let logCounter = 0
  while (true) {
    logCounter += 1
    try {
      const queueLength = await getQueueLength()
      const now = Date.now() / 1000
      const timeToConnect = date.getTime() / 1000
      // console.info(timeToConnect - now)
      const secondsToConnect = (timeToConnect - now) - (queueLength * 86)
      if (logCounter % 15 === 0 || secondsToConnect < 15 * 60) {
        console.info(`Connecting in ${Math.floor(secondsToConnect / 3600)}h ${Math.floor(secondsToConnect / 60 % 60)}m ${Math.floor(secondsToConnect) % 60}s`)
      }
      if (secondsToConnect < 0) {
        console.info('Connecting. Queue length', queueLength, new Date().toLocaleString())
        init()
          .catch(console.error)
        return
      }
      await wait(60_000)
    } catch (err) {
      console.error(err)
      await wait(60_000)
      continue
    }
  }
}

if (process.env.CONNECT_ON) {
  try {
    if (isNaN(Number(process.env.CONNECT_ON))) {
      console.error(new Error('CONNECT_ON must be a number'))
      process.exit(1)
    }
    const date = new Date(Number(process.env.CONNECT_ON))  
    console.info('Should connect at', date.toLocaleString())
    // Check if the date is in the past
    if (date.getTime() < Date.now()) {
      console.error('Date is in the past')
      process.exit(1)
    }
    // log Time until as hours:minutes
    console.info('Time until', new Date(date.getTime() - Date.now()).toISOString().substr(11, 8))
    connectWhenReady(date)
      .catch(console.error)
  } catch (err) {
    console.info('Invalid date format', process.env.CONNECT_ON, err)
    process.exit(1)
  }
} else {
  init()
}
