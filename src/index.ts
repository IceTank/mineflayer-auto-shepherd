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
import { InspectorProxy } from "mineflayer-proxy-inspector";
import { inject as autoShepherdPlugin, Modes } from "./plugins/autoShepherd";
import path from "path";
import { promises as fs } from "fs";
import { toDate } from "./timeCalculator";
import PChat from 'prismarine-chat'
import type { ChatMessage } from 'prismarine-chat'
import type { MessageBuilder as TypeMessageBuilder } from 'prismarine-chat'
import { getQueueLengths } from "./queueLengthAPI";
import { Commands } from "./plugins/commands";
import { ChatTools as ChatToolsClass } from "./plugins/chatTools";

Error.stackTraceLimit = 50

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

async function init() {
  const proxy = new InspectorProxy({
    host: process.env.MCHOST,
    // username: process.env.MCUSERNAME as string,
    username: 'proxyBot',
    // password: process.env.MCPASSWORD,
    // auth: 'microsoft',
    auth: 'mojang',
    profilesFolder: nmpCache,
    version: '1.12.2',
    // version: '1.18.2',
    checkTimeoutInterval: 90_000
  }, {
    motd: 'loading...',
  })

  let afkIntervalHandle: NodeJS.Timer | undefined = undefined;
  let actionTimeout: NodeJS.Timer | undefined;
  let lastAction = 0
  const watchdogTimeout = 60 * 4 * 1000
  let logNoneQueueChat = true
  let loginDate: Date | null = null
  let spawnAbortController = new AbortController()
  let lastQueuePosition = 0
  let MessageBuilder: typeof TypeMessageBuilder | undefined
  let Chat: typeof ChatMessage | undefined
  let proxyStatus: 'queue' | 'online' | 'offline' = 'offline'
  let host = process.env.MCHOST
  let logoffOnDamage = process.env.LOGOFFONDAMAGE ? process.env.LOGOFFONDAMAGE === 'true' : true
  let eatOnHunger = process.env.EATONHUNGER ? process.env.EATONHUNGER === 'true' : true
  let ChatTools: ChatToolsClass | undefined
  const commandManager = Commands.getInstance()

  const initWatchdog = () => {
    lastAction = Date.now()
    actionTimeout = setInterval(() => {
      const now = new Date()
      if (!bot.proxy.botIsControlling) return
      if (bot.autoShepherd.currentMode === 'stopped' || bot.autoShepherd.currentMode === 'idle') return
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
      const hoursConnected = Math.floor(timeConnected / (1000 * 60 * 60))
      const minutesConnected = Math.floor((timeConnected - hoursConnected * 1000 * 60 * 60) / (1000 * 60))
      console.info(`Bot was connected for ${hoursConnected}h ${minutesConnected}m`)
    }
    spawnAbortController.abort()
    setTimeout(() => {
      init()
        .catch(console.error)
    }, 30000 + disconnectCooldown)
  }

  const updateMotd = () => {
    let line1 = ''
    let line2 = ''
    let mHost = host ?? 'unknown'
    if (!MessageBuilder) return
    const nPre = '&2'
    if (proxyStatus === 'queue') {
      line1 = `${nPre}${bot.username}&r ${mHost} -> &6Queue`
      line2 = `&7Position &6${lastQueuePosition}&r`
    } else if (proxyStatus === 'online') {
      const playerLength = Object.keys(bot.players).length
      const itemAmount = bot.inventory.items().reduce((i, v) => i + v.count, 0);
      const ironAmount = bot.inventory.items().filter(i => i.name === 'iron_ingot').reduce((i, v) => i + v.count, 0);
      line1 = `${nPre}${bot.username}&r  ${mHost} -> &aOnline`
      line2 = `&7Players &3${playerLength}&7 ⎜ Items &3${itemAmount}&7 ⎜ Iron left &3${ironAmount}`
    }
    // console.info('Setting motd to', line1, line2)
    const motd = MessageBuilder.fromString(`${line1}\n${line2}`)
    proxy.setChatMessageMotd(motd.toJSON())
  }

  // @ts-ignore-error
  bot = proxy.conn.bot
  bot.on('login', () => {
    loginDate = new Date()
    proxyStatus = 'queue'
    console.info('Login with username', bot.username)
    const { MessageBuilder: tmp } = PChat(bot.version)
    MessageBuilder = tmp
    ChatTools = new ChatToolsClass(MessageBuilder)
  })

  function parseMessageToPosition(message: string): { pos: number, didChange: boolean, firstTime?: boolean } {
    if (!message.includes('Position in queue:')) {
      // console.info('No position in message', message)
      return {
        pos: lastQueuePosition,
        didChange: false
      }
    }
    const match = message.match(/(\d+)/)
    if (!match) {
      // console.info('Could not find position in message', message)
      return { pos: lastQueuePosition, didChange: false }
    }
    const num = Number(match[0])
    if (isNaN(num)) {
      // console.info('Parsing match failed', match[0])
      return {
        pos: lastQueuePosition,
        didChange: false
      }
    }
    if (lastQueuePosition !== num) {
      const oldPos = lastQueuePosition
      lastQueuePosition = num
      return {
        pos: num,
        didChange: true,
        firstTime: oldPos === 0
      }
    }
    return { pos: lastQueuePosition, didChange: false }
  }

  bot.on('error', console.error)
  bot.on('kicked', (reason) => console.info('Kicked for reason', reason))
  bot.on('end', handleReconnect)
  bot.on('message', (chatMessage) => {
    const chatString = chatMessage.toString()
    const strings = chatString.split('\n')
    for (const string of strings) {
      if (string.replace(/\n/g, '').trim() === '') continue
      try {
        if (string.startsWith('Connecting to the server...')) {
          console.info(string)
          ringConsoleBell()
        } else if (string.startsWith('You can purchase priority queue')) {
          return
        } else if (string.startsWith('Position in queue')) {
          const { pos, didChange, firstTime } = parseMessageToPosition(string)
          updateMotd()
          if ((didChange && (pos < 10 || (pos % 10 === 0))) || firstTime) {
            console.info('Position in queue', pos)
          }
        } else if (logNoneQueueChat) {
          console.info(`> ${string}`)
        }
      } catch (err) {
        
      }
      fs.appendFile(chatLog, string + '\n')
        .catch(console.error)
    }
  })
  // bot._client.on('title', (packet) => {
  //   if (packet.action !== 0) return
  //   if (!Chat) return
  //   try {
  //     // console.info('Packets', packet)
  //     const text = new Chat(JSON.parse(packet.text))
  //     const string = text.toString()
  //     if (string.trim() === '') return
  //     const { pos, didChange } = parseMessageToPosition(string)
  //     // console.info('Position from title', pos)
  //     // if (!didChange) return
  //     // updateMotd()
  //     // if (pos < 10 || (pos % 10 === 0 && didChange)) {
  //     // }
  //   } catch (err) {
      
  //   }
  // })
  proxy.on('clientConnect', (client) => {
    updateMotd()
    if (!ChatTools || !loginDate) return
    ChatTools.sendStatusMessage(client, loginDate, bot.autoShepherd.currentMode)
  })
  proxy.on('clientChatRaw', (client, message) => {
    commandManager.onLine(message, client)
  })

  bot.loadPlugins([pathfinder, autoeat, autoShepherdPlugin])
  
  // @ts-ignore
  bot.autoEat.disable()

  function exitBot() {
    console.info('Exiting')
    commandManager.flushListeners()
    bot.autoShepherd.stopSheering()
      .then(() => bot.autoShepherd.logResults())
      .then(() => process.exit(0))
      .catch(console.error)
  }

  commandManager.on('exitBot', () => { exitBot() })
  commandManager.on('startCycle', () => {
    bot.autoShepherd.startSheering()
  })
  commandManager.on('stopSheering', () => {
    bot.autoShepherd.switchMode('stopped')
  })
  commandManager.on('currentMode', (client) => {
    if (!client) return console.info('Current mode:', bot.autoShepherd.currentMode)
    if (!MessageBuilder) return console.info('No MessageBuilder')
    const message = new MessageBuilder()
    message.setColor('green').setText(`Current mode: ${bot.autoShepherd.currentMode}`)
    client.write('chat', {
      position: 1,
      message: JSON.stringify(message.toJSON())
    })
  })
  commandManager.on('status', (client) => {
    if (!client || !ChatTools || !loginDate) return console.info('Current mode:', bot.autoShepherd.currentMode)
    if (!MessageBuilder) return console.info('No MessageBuilder')
    ChatTools.sendStatusMessage(client, loginDate, bot.autoShepherd.currentMode)
  })
  commandManager.on('startSheering', () => {
    bot.autoShepherd.startSheering()
  })
  commandManager.on('stopSheering', () => {
    bot.autoShepherd.stopSheering()
  })
  commandManager.on('help', (client, arg) => {
    if (!MessageBuilder || !ChatTools) return console.info('No MessageBuilder')
    if (!client) return console.info('No client')
    const message = new MessageBuilder()
    if (Array.isArray(arg)) {
      const messageString = arg.map(command => command.command).join(', ')
      message.setColor('green').setText(messageString)
      ChatTools.sendMessage(client, message)
    } else {
      if (arg.notFound) {
        message.setColor('yellow')
      } else {
        message.setColor('green')
      }  
      const messageString = `${arg.command} - ${arg.description}`
      message.setText(messageString)
      ChatTools.sendMessage(client, message)
    }
  })
  commandManager.on('switchMode', (client, mode) => {
    if (!client || !ChatTools) return console.info('No client')
    if (!MessageBuilder) return console.info('No MessageBuilder')
    if (!Modes.includes(mode)) {
      const root = new MessageBuilder()
      
      ChatTools.sendMessage(client, new MessageBuilder().setColor('red').setText('Invalid mode'))
    } else {
      // @ts-expect-error
      bot.autoShepherd.switchMode(mode)
      ChatTools.sendMessage(client, new MessageBuilder().setColor('green').setText(`Switched to mode ${mode}`))
    }
  })

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

  proxyStatus = 'online'
  logNoneQueueChat = false
  updateMotd()
  const motdUpdateInterval = setInterval(() => {
    updateMotd()
  }, 15_000)

  initWatchdog()
  if (process.env.VIEWER === 'true') mineflayerViewer(bot, { port: 3000 })
  if (process.env.INV === 'true') inventoryViewer(bot, { port: 3001 })
  if (process.env.START_IDLE === 'true') {
    console.info('Starting in mode idle')
    bot.autoShepherd.switchMode('idle')
  } else {
    console.info('Starting in mode running')
    bot.autoShepherd.switchMode('running')
  }
  // @ts-ignore
  bot.autoEat.options.priority = "foodPoints"
  // @ts-ignore
  bot.autoEat.options.bannedFood = []
  // @ts-ignore
  bot.autoEat.options.eatingTimeout = 3

  afkIntervalHandle = setInterval(() => {
    bot.swingArm(undefined)
  }, 15000)

  bot.on('end', () => {
    console.info('Disconnected')
    if (afkIntervalHandle) clearInterval(afkIntervalHandle)
    if (actionTimeout) clearInterval(actionTimeout)
    clearInterval(motdUpdateInterval)
    // @ts-ignore
    if (bot.viewer?.close) bot.viewer.close()
    bot.autoShepherd.stopSheering()
    bot.removeAllListeners()
    commandManager.flushListeners()
  })
  
  bot.on('health', async () => {
    if (bot.health < 18 && logoffOnDamage && bot.proxy.botIsControlling) {
      console.warn('Took to much damage logging off')
      bot.autoShepherd.logResults()
      process.exit(1)
    }
    // @ts-ignore
    if (bot.food < 16 && eatOnHunger && !bot.autoEat.isEating && bot.proxy.botIsControlling) {
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
}

// Catch MaxListenersExceededWarning
process.on('warning', (warning) => {
  console.warn(warning.message)
  console.warn(warning.stack)
})

async function connectWhenReady(date: Date) {
  let logCounter = 0
  debugger
  while (true) {
    logCounter += 1
    try {
      const queueLength = await getQueueLengths()
      if (!queueLength) return
      const main = queueLength.main.normal
      const now = Date.now() / 1000
      const timeToConnect = date.getTime() / 1000
      // console.info(timeToConnect - now)
      const secondsToConnect = (timeToConnect - now) - (main * 86)
      if (logCounter % 15 === 0 || secondsToConnect < 15 * 60) {
        console.info(`Connecting in ${Math.floor(secondsToConnect / 3600)}h ${Math.floor(secondsToConnect / 60 % 60)}m ${Math.floor(secondsToConnect) % 60}s to reach end off queue in time`)
      }
      if (secondsToConnect < 0) {
        console.info('Connecting to server. Current queue length:', main, 'date', new Date().toLocaleString())
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
    let date
    const timestamp = Number(process.env.CONNECT_ON)
    if (!isNaN(timestamp)) {
      date = new Date(timestamp)
    } else {
      date = toDate(process.env.CONNECT_ON)
    }
    if (!date) {
      console.error(new Error('CONNECT_ON must be a number or a date'))
      process.exit(1)
    }
    console.info('Should connect at', date.toLocaleString())
    // Check if the date is in the past
    if (date.getTime() < Date.now()) {
      console.error('Date is in the past. Connecting right now.')
      connectWhenReady(new Date()).catch(console.error)
      // init().catch(console.error)
    } else {
      // log Time until as hours:minutes
      console.info('Time until', new Date(date.getTime() - Date.now()).toISOString().substr(11, 8))
      connectWhenReady(date)
        .catch(console.error)
    }
  } catch (err) {
    console.info('Invalid date format', process.env.CONNECT_ON, err)
    process.exit(1)
  }
} else {
  init()
}
