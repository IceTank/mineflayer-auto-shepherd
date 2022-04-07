import { Bot, BotOptions, Chest } from "mineflayer";
import { goals } from "mineflayer-pathfinder";
import Data from "minecraft-data";
import { promisify } from "util";
import { EventEmitter } from "stream";
import { once } from "events";
const wait = promisify(setTimeout)

declare module 'mineflayer' {
  interface Bot {
    autoShepherd: AutoShepherd
  }
}

interface AutoShepherd {
  getItems: () => Promise<void>
  getWool: () => Promise<void>
  depositItems: () => Promise<boolean>
  startSheering: () => void
  stopSheering: () => Promise<void>
  isRunning: () => boolean
  logResults: () => void

  emitter: AutoShepherdEmitter
}

interface AutoShepherdEmitter extends EventEmitter {
  on(event: 'cycle', listener: () => void): this
}

export function inject(bot: Bot, options: BotOptions): void {
  let shouldDeposit: boolean = false
  let shouldStop: boolean = false
  let isRunning = false
  const mcData = Data(bot.version)

  let startTime: Date = new Date()
  let itemsDepositedTotal: number = 0

  bot.autoShepherd = {
    getItems: async () => {
      const droppedItems = Object.values(bot.entities).filter(e => {
        return e.name === 'item' && e.position.distanceTo(bot.entity.position) < 30 && e.getDroppedItem()?.name?.includes('wool')
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
          const { x, y, z } = item.position.floored()
          await bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
        } catch (err) {
          if ((err as Error).name !== 'NoPath') console.error(err)
        }
      }
    },
    getWool: async () => {
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
    },
    depositItems: async () => {
      shouldDeposit = false
      const woolId = mcData.itemsByName.wool.id
      let itemsDeposited = 0
      // console.info('Starting to deposit items')
      /** Deposit items in the chest with manual item clicking to counter lag/anti cheat */
      const tryDeposit = async (window: Chest): Promise<boolean> => {
        // @ts-ignore
        while (window.findInventoryItem(woolId) !== null) {
          // @ts-expect-error
          const emptySlot = window.firstEmptyContainerSlot() as number | null
          if (emptySlot === null) return false
          // @ts-ignore
          const invItem = window.findInventoryItem(woolId) as Item
          if (invItem === null) return true
          itemsDeposited += invItem.count
          await bot.clickWindow(invItem.slot, 0, 0)
          await wait(200)
          await bot.clickWindow(emptySlot, 0, 0)
          await wait(200)
        }
        return true
      }
  
      const chests = bot.findBlocks({
        matching: [mcData.blocksByName.chest.id, mcData.blocksByName.trapped_chest.id],
        count: 64,
        maxDistance: 64
      })
      if (chests.length === 0) {
        console.error('No chests found') 
        return false
      }
      // console.info(chests)
      const depositSpots = chests.filter(c => bot.blockAt(c.offset(0, -1, 0))?.type === woolId)
      // console.info(depositSpots)
  
      if (depositSpots.length === 0) {
        console.error('No deposit spots found')
        return false
      }
      for (const d of depositSpots) {
        let window: Chest | undefined = undefined
        try {
          await bot.pathfinder.goto(new goals.GoalGetToBlock(d.x, d.y, d.z))
          const containerBlock = bot.blockAt(d)
          if (!containerBlock) {
            console.info('Invalid block at ' + d.x + ' ' + d.y + ' ' + d.z, ' expected something got nullish')
            continue
          }
          console.info(`Depositing items into chest at ${containerBlock.position.toString()}`)
          window = await bot.openChest(containerBlock)
          const res = await tryDeposit(window)
          window.close()
          if (res) {
            console.info(`Deposited ${itemsDeposited} items (${Math.floor(itemsDeposited / 64)} stacks + ${itemsDeposited % 64}) into chests`)
            itemsDepositedTotal += itemsDeposited
            return true
          }
        } catch (err) {
          console.error(err)
          if (window) window.close()
          break
        } 
      }
      if (bot.inventory.emptySlotCount() < 2) {
        console.info('No more space to put wool')
        bot.autoShepherd.logResults()
        process.exit(0)
      } else {
        return true
      }
    },
    isRunning: () => {
      return isRunning
    },
    startSheering: () => {
      if (isRunning) return
      shouldStop = false
      startTime = new Date()
      itemsDepositedTotal = 0
      console.info('Starting')
      startSheering()
        .catch(console.error)
    },
    stopSheering: async () => {
      if (shouldStop) return
      shouldStop = true
      await once(bot.autoShepherd.emitter, 'cycle')
      isRunning = false
      bot.autoShepherd.logResults()
    },
    emitter: new EventEmitter(),
    logResults: () => {
      const endTime = new Date()
      const timeTaken = endTime.getTime() - startTime.getTime()
      const itemsInventory = bot.inventory.items()
        .filter(i => i && i.name.includes('wool'))
        .reduce((acc, i) => acc + i.count, 0)
      const itemsTotal = itemsDepositedTotal + itemsInventory
      const itemsPerHour = Math.floor(itemsTotal / (timeTaken / 3_600_000))
      console.info(`Farmed ${itemsPerHour} items per hour for a total off ${itemsTotal} items`)
    }
  } 

  const startSheering = async () => {
    cycle()
  }

  const cycle = async () => {
    if (shouldStop) {
      isRunning = false
      bot.autoShepherd.emitter.emit('cycle')
      return
    }
    isRunning = true
    if (bot.inventory.emptySlotCount() < 2) await bot.autoShepherd.depositItems()
    const shears = bot.inventory.items().find(i => i.name.includes('shears'))
    if (!shears) {
      console.info('No more shears left')
      bot.autoShepherd.logResults()
      process.exit(0)
    }
    // console.info('Getting wool')
    await bot.autoShepherd.getWool()
    await wait(1000)
    // console.info('Getting dropped items')
    await bot.autoShepherd.getItems()
    await wait(1000)
    bot.autoShepherd.emitter.emit('cycle')
    setTimeout(() => {
      cycle()
        .catch(console.error)
    }, 1000)
  }
}