import * as mineflayer from "mineflayer"
import dotenv from "dotenv"
import { goals, Movements, pathfinder } from "mineflayer-pathfinder"
const mineflayerViewer = require('prismarine-viewer').mineflayer
import autoeat from "mineflayer-auto-eat";
import MinecraftData from "minecraft-data";
import { once } from "events";
// @ts-ignore
import inventoryViewer = require('mineflayer-web-inventory')
const wait = require('util').promisify(setTimeout)
dotenv.config()
import { makeBot } from "mineflayer-proxy-inspector";
import path from "path";
import { promises as fs } from "fs";
import { Item } from "prismarine-item";
import readline from "readline";

const chatLog = path.join(__dirname, '../chat.txt')
console.info('Chat log:', chatLog)

let bot: mineflayer.Bot

async function init() {
  const conn = makeBot({
    host: process.env.MCHOST,
    username: process.env.MCUSERNAME as string,
    password: process.env.MCPASSWORD,
    auth: 'microsoft',
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
    
  bot = conn.bot
  bot.on('error', console.error)
  bot.on('kicked', (reason) => console.info('Kicked for reason', reason))
  bot.on('end', () => {
    // @ts-ignore
    if (bot.viewer?.close) bot.viewer.close()
    console.info('Disconnected')
    if (afkIntervalHandle) clearInterval(afkIntervalHandle)
    setTimeout(() => {
      console.info('Restarting bot')
      init()
        .catch(console.error)
    }, 15000)
    if (actionTimeout) clearTimeout(actionTimeout)
  })
  bot.on('message', (chatMessage) => {
    // console.info(chatMessage.toAnsi())
    fs.appendFile(chatLog, chatMessage.toString() + '\n')
      .catch(console.error)
  })

  resetActionTimeout()

  let shouldShear = false
  let shouldEat = false
  let shouldDeposit = false

  bot.loadPlugins([pathfinder, autoeat])
  
  // @ts-ignore
  bot.autoEat.disable()

  await once(bot, 'spawn')
  mineflayerViewer(bot, { port: 3000 })
  inventoryViewer(bot, { port: 3001 })
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

  bot.on('health', () => {
    if (bot.health < 10) {
      console.warn('Took to much damage logging off')
      process.exit(1)
    }
    // @ts-ignore
    if (bot.food < 16 && ! bot.autoEat.isEating) {
      shouldEat = true
    }
  })

  rl.on('line', (line) => {
    line = line.trim()
    if (line === 'start' && shouldShear === false) {
      shouldShear = true
      startShearing()
        .catch(console.error)
      return
    } else if (line === 'stop') {
      shouldShear = false
    } else if (line === 'test') {
      console.info(conn.receivingPclients.length)
    } else if (line === 'deposit') {
      shouldDeposit = true
    }
  })

  bot.on('end', () => rl.close())

  const startShearing = async () => {
    while (shouldShear) {
      resetActionTimeout()
      if (shouldEat) {
        console.info('Starting to eat')
        await new Promise<void>((resolve) => {
          // @ts-ignore
          bot.autoEat.eat((err: Error) => {
            if (err) console.error(err)
            shouldEat = false
            resolve()
          })
        })
      }
      const shears = bot.inventory.items().find(i => i.name.includes('shears'))
      if (!shears) {
        console.info('No more shears left')
        shouldShear = false
        continue
      }
      // console.info('Getting wool')
      await getWool()
      await wait(1000)
      // console.info('Getting dropped items')
      await getItems()
      await wait(1000)
      if (bot.inventory.emptySlotCount() < 2 || shouldDeposit) await depositItems()
      await wait(1000)
    }
  }

  const depositItems = async () => {
    shouldDeposit = false
    const woolId = mcData.itemsByName.wool.id
    const tryDeposit = async (window: mineflayer.Chest): Promise<boolean> => {
      // @ts-ignore
      while (window.findInventoryItem(woolId) !== null) {
        // @ts-expect-error
        const emptySlot = window.firstEmptyContainerSlot() as number | null
        if (emptySlot === null) return false
        // @ts-ignore
        const invItem = window.findInventoryItem(woolId) as Item
        if (invItem === null) return true
        await bot.clickWindow(invItem.slot, 0, 0)
        await wait(200)
        await bot.clickWindow(emptySlot, 0, 0)
        await wait(200)
      }
      return true
    }

    const chests = bot.findBlocks({
      matching: [mcData.blocksByName.chest.id, mcData.blocksByName.trapped_chest.id],
      count: 64
    })
    if (chests.length === 0) return
    // console.info(chests)
    const depositSpots = chests.filter(c => bot.blockAt(c.offset(0, -1, 0))?.type === woolId)
    // console.info(depositSpots)

    for (const d of depositSpots) {
      let window: mineflayer.Chest | undefined = undefined
      try {
        await bot.pathfinder.goto(new goals.GoalGetToBlock(d.x, d.y, d.z))
        const containerBlock = bot.blockAt(d)
        if (!containerBlock) continue
        window = await bot.openChest(containerBlock)
        const res = await tryDeposit(window)
        window.close()
        if (res) return true
      } catch (err) {
        console.error(err)
        if (window) window.close()
        break
      } 
    }
    if (bot.inventory.emptySlotCount() < 2) {
      console.info('No more space to put wool')
      process.exit(0)
    } else {
      return true
    }
  }
}

async function getItems() {
  const droppedItems = Object.values(bot.entities).filter(e => {
    return e.name === 'item' && e.position.distanceTo(bot.entity.position) < 30
  })
  if (droppedItems.length === 0) return
  droppedItems.sort((a, b) => {
    return b.position.distanceTo(bot.entity.position) - a.position.distanceTo(bot.entity.position)
  })
  while (droppedItems.length !== 0) {
    droppedItems.sort((a, b) => {
      return b.position.distanceTo(bot.entity.position) - a.position.distanceTo(bot.entity.position)
    })
    const item = droppedItems.pop()
    if (!item) break
    try {
      await bot.pathfinder.goto(new goals.GoalFollow(item, 1))
    } catch (err) {
      if ((err as Error).name !== 'NoPath') console.error(err)
    }
  }
}

async function getWool() {
  const unSheeredSheep = Object.values(bot.entities).filter(e => {
    return e.name === 'sheep' && e.position.distanceTo(bot.entity.position) < 45 && (e.metadata[13] as unknown as number) < 16 && (e.metadata[12] as unknown as boolean) == false
  })
  unSheeredSheep.sort((a, b) => {
    return b.position.distanceTo(bot.entity.position) - a.position.distanceTo(bot.entity.position)
  })
  if (unSheeredSheep.length === 0) return
  while (unSheeredSheep.length !== 0) {
    unSheeredSheep.sort((a, b) => {
      return b.position.distanceTo(bot.entity.position) - a.position.distanceTo(bot.entity.position)
    })
    const sheep = unSheeredSheep.pop()
    if (!sheep) break
    try {
      await bot.pathfinder.goto(new goals.GoalFollow(sheep, 1))
      const shears = bot.inventory.items().find(i => i.name.includes('shears'))
      if (!shears) {
        console.error('No more shears left')
        return
      }
      await bot.equip(shears.type, 'hand')
      await wait(100)
      await bot.activateEntity(sheep)
    } catch (err) {
      if ((err as Error).name !== 'NoPath') console.error(err)
    }
  }
}

init()