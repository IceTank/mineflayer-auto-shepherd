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
  autoCraftShears: boolean
  lastActions: string[]
  getItems: () => Promise<void>
  getWool: () => Promise<void>
  depositItems: () => Promise<boolean>
  startSheering: () => void
  stopSheering: () => Promise<void>
  isRunning: () => boolean
  craftShears: () => Promise<boolean>
  logResults: () => void

  emitter: AutoShepherdEmitter
}

interface AutoShepherdEmitter extends EventEmitter {
  on(event: 'cycle', listener: () => void): this
}

const InventoryClickDelay = 200

async function timeoutAfter(timeout = 5000): Promise<never> {
  await wait(timeout)
  throw new Error('Timeout')
}

export function inject(bot: Bot, options: BotOptions): void {
  let shouldDeposit: boolean = false
  let shouldStop: boolean = false
  let isRunning = false
  const mcData = Data(bot.version)
  const IronIngot = mcData.itemsByName.iron_ingot

  let startTime: Date = new Date()
  let itemsDepositedTotal: number = 0

  const addLastAction = (action: string) => {
    bot.autoShepherd.lastActions.push(action)
    if (bot.autoShepherd.lastActions.length > 10) {
      bot.autoShepherd.lastActions.shift()
    }
  }

  bot.autoShepherd = {
    autoCraftShears: true,
    lastActions: [],
    getItems: async () => {
      addLastAction('getItems')
      const droppedItems = Object.values(bot.entities).filter(e => {
        try {
          return e.name === 'item' && e.position.distanceTo(bot.entity.position) < 30 && e.getDroppedItem()?.name?.includes('wool')
        } catch (err) {
          console.error('Got error looking for items')
          console.error(err)
          console.error(e)
          return false
        }
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
          const walking = bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
          try {
            await Promise.race([walking, timeoutAfter(20_000)])
          } catch (err) {
            bot.pathfinder.setGoal(null)
            throw err
          }
        } catch (err) {
          if ((err as Error).name !== 'NoPath') console.error(err)
        }
      }
    },
    getWool: async () => {
      addLastAction('getWool')
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
          const walking = bot.pathfinder.goto(new goals.GoalFollow(sheep, 1))
          try {
            await Promise.race([walking, timeoutAfter(20_000)])
          } catch (err) {
            bot.pathfinder.setGoal(null)
            throw err
          }
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
      addLastAction('depositItems')
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
          await wait(InventoryClickDelay)
          await bot.clickWindow(emptySlot, 0, 0)
          await wait(InventoryClickDelay)
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
          const walking = bot.pathfinder.goto(new goals.GoalGetToBlock(d.x, d.y, d.z))
          try {
            await Promise.race([walking, timeoutAfter(20_000)])
          } catch (err) {
            bot.pathfinder.setGoal(null)
            throw err
          }
          const containerBlock = bot.blockAt(d)
          if (!containerBlock) {
            console.info('Invalid block at ' + d.x + ' ' + d.y + ' ' + d.z, ' expected something got nullish')
            continue
          }
          console.info(`Depositing items into chest at ${containerBlock.position.toString()}`)
          for (let i = 0; i < 3; i++) {
            try {
              await Promise.race([bot.lookAt(containerBlock.position), timeoutAfter()])
              window = await Promise.race([bot.openChest(containerBlock), timeoutAfter()])
              break
            } catch (err) { 
              console.warn(err) 
            }
          }
          if (!window) {
            console.info('Failed to open chest at ' + d.x + ' ' + d.y + ' ' + d.z)
            continue
          }
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
        botExit(0)
        return false
      } else {
        return true
      }
    },
    isRunning: () => {
      return isRunning
    },
    startSheering: () => {
      addLastAction('startSheering')
      if (isRunning) {
        console.info('Already running')
        return
      }
      shouldStop = false
      startTime = new Date()
      itemsDepositedTotal = 0
      console.info('Starting')
      startSheering()
        .catch(console.error)
    },
    stopSheering: async () => {
      addLastAction('stopSheering')
      if (shouldStop) {
        console.info('Already stopping')
        return
      }
      shouldStop = true
      await once(bot.autoShepherd.emitter, 'cycle')
      isRunning = false
    },
    craftShears: async () => {
      addLastAction('craftShears')
      const ironIngotSum = bot.inventory.items().filter(i => i.type === IronIngot.id).reduce((a, b) => a + b.count, 0)
      if (ironIngotSum < 2) {
        console.info('Not enough iron ingots')
        return false
      }
      {
        const pickSuccess = await Promise.race([pickItem(IronIngot.id), timeoutAfter()])
        if (!pickSuccess) {
          console.info('Pickup iron ingot failed')
          return false
        }
      }
      // Place first iron ingot in crafting grid
      await bot.clickWindow(2, 1, 0)
      await wait(InventoryClickDelay)
      {
        const pickSuccess = await Promise.race([pickItem(IronIngot.id), timeoutAfter()])
        if (!pickSuccess) {
          console.info('Pickup iron ingot failed')
          return false
        }
      }
      // Place second iron ingot in crafting grid
      await bot.clickWindow(3, 1, 0)
      await wait(InventoryClickDelay)
      {
        const success = await Promise.race([unselectItem(), timeoutAfter()])
        if (!success) {
          console.info('unselecting iron ingot failed')
          return false
        }
      }
      // Click the crafting grid result slot
      // bot._client.on('transaction', console.info)
      await bot.clickWindow(0, 0, 0)
      await wait(InventoryClickDelay)
      {
        // Deposit crafted shears into the inventory
        const success = await Promise.race([unselectItem(true), timeoutAfter()])
        if (!success) {
          console.info('unselecting crafted failed')
          return false
        }
      }
      return true
    },
    logResults: () => {
      const endTime = new Date()
      const timeTaken = endTime.getTime() - startTime.getTime()
      const itemsInventory = bot.inventory.items()
        .filter(i => i && i.name.includes('wool'))
        .reduce((acc, i) => acc + i.count, 0)
      const itemsTotal = itemsDepositedTotal + itemsInventory
      const itemsPerHour = Math.floor(itemsTotal / (timeTaken / 3_600_000))
      console.info(`Farmed ${itemsPerHour} items per hour for a total off ${itemsTotal} items`)
    },
    emitter: new EventEmitter()
  }

  const botExit = (code: number = 1): never => {
    console.info('Last actions before quitting:', bot.autoShepherd.lastActions)
    bot.autoShepherd.logResults()
    process.exit(code)
  }

  const pickItem = async (itemType: number) => {
    if (bot.inventory.selectedItem && bot.inventory.selectedItem.type !== itemType) {
      if (!await unselectItem()) return false
      await wait(InventoryClickDelay)
    }
    if (bot.inventory.selectedItem?.type === itemType) return true
    const item = bot.inventory.items().find(i => i.type === itemType)
    if (!item) return false
    await bot.clickWindow(item.slot, 0, 0)
    return true
  }

  const unselectItem = async (hotbar = false) => {
    if (!bot.inventory.selectedItem) return true
    const rangeStart = hotbar ? bot.inventory.hotbarStart : bot.inventory.inventoryStart
    let freeSlot = bot.inventory.firstEmptySlotRange(rangeStart, bot.inventory.hotbarStart + 9)
    if (freeSlot === null) {
      // If no free slot force use a slot and drop the item already in it
      freeSlot = hotbar ? 36 : 9
      console.info(`No free slot to put item, dropping ` 
        + `${bot.inventory.slots[freeSlot]?.name}x${bot.inventory.slots[freeSlot]?.count}`)
    }
    await bot.clickWindow(freeSlot, 0, 0)
    await wait(InventoryClickDelay)
    if (bot.inventory.selectedItem) {
      await bot.clickWindow(-999, 0, 0)
      await wait(InventoryClickDelay)
    }
    return true
  }

  const startSheering = async () => {
    cycle()
  }

  const cycle = async () => {
    addLastAction('cycle start')
    if (shouldStop) {
      isRunning = false
      bot.autoShepherd.emitter.emit('cycle')
      return
    }
    isRunning = true
    if (bot.inventory.emptySlotCount() < 2) await bot.autoShepherd.depositItems()
    const shears = bot.inventory.items().find(i => i.name.includes('shears'))
    if (!shears) {
      if (!bot.autoShepherd.autoCraftShears) {
        console.info('No more shears left')
        botExit(0)
      }
      console.info('Crafting new shears')
      const success = await bot.autoShepherd.craftShears()
      if (!success) {
        console.info('No more shears left. Crafting shears failed')
        botExit(1)
      }
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