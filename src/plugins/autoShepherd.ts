import { Bot, BotOptions, Chest } from "mineflayer";
import Data from "minecraft-data";
import { promisify } from "util";
import { EventEmitter } from "stream";
import { once } from "events";
const wait = promisify(setTimeout)
import { Movements, goals } from "mineflayer-pathfinder";
import { v1 as uuid } from "uuid"

declare module 'mineflayer' {
  interface Bot {
    autoShepherd: AutoShepherd
  }
}

type BotModes = 'idle' | 'running' | 'stopped' | 'paused'
const modeRequireCycling = ['idle', 'running', 'paused']

interface AutoShepherd {
  autoCraftShears: boolean
  lastActions: string[]
  currentMode: BotModes
  start: () => void
  addLastAction: (action: string) => void
  getItems: () => Promise<void>
  getWool: () => Promise<void>
  depositItems: () => Promise<boolean>
  startSheering: () => void
  stopSheering: () => Promise<void>
  isRunning: () => boolean
  craftShears: () => Promise<boolean>
  logResults: () => void
  switchMode: (mode: BotModes) => void
  pause: () => void
  unpause: () => void

  emitter: AutoShepherdEmitter
}

interface AutoShepherdEmitter extends EventEmitter {
  on(event: 'cycle', listener: () => void): this
  on(event: 'alive', listener: () => void): this
}

const InventoryClickDelay = 200

async function timeoutAfter(timeout = 5000): Promise<never> {
  await wait(timeout)
  throw new Error('Timeout')
}

export function inject(bot: Bot, options: BotOptions): void {
  let isRunning = false
  let isAwaitingCycleStart = false
  const mcData = Data(bot.version)
  const IronIngot = mcData.itemsByName.iron_ingot
  const maxTimeInAction = 30_000
  const maxCycleTime = maxTimeInAction * 5

  let startTime: Date = new Date()
  let itemsDepositedTotal: number = 0
  let lastMode: BotModes = 'idle'

  bot.autoShepherd = {
    autoCraftShears: true,
    lastActions: [],
    currentMode: 'idle',
    start: () => {
      if (isRunning || isAwaitingCycleStart) {
        console.info('Already running')
        return
      }
      console.info('Starting autoShepherd')
      isAwaitingCycleStart = true
      startTime = new Date()
      const defaultMovement = new Movements(bot, mcData)
      defaultMovement.canDig = false
      defaultMovement.scafoldingBlocks = []
      defaultMovement.allowSprinting = false
      bot.pathfinder.setMovements(defaultMovement)
      startCycling()
        .catch(err => console.error('Cycle start returned error', err))
    },
    addLastAction: (action: string) => {
      const now = new Date()
      bot.autoShepherd.lastActions.push(`${now.toLocaleTimeString()} ${action}`)
      if (bot.autoShepherd.lastActions.length > 30) {
        bot.autoShepherd.lastActions.shift()
      }
    },
    getItems: async (): Promise<void> => {
      const actionStart = Date.now()
      bot.autoShepherd.addLastAction('getItems')
      let maxCycles = 5
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
      let cycle = 0
      while (droppedItems.length !== 0 && actionStart + maxTimeInAction > Date.now() && cycle < maxCycles) {
        if (!bot.autoShepherd.isRunning()) return
        cycle++
        droppedItems.sort((a, b) => {
          return b.position.distanceTo(bot.entity.position) - a.position.distanceTo(bot.entity.position)
        })
        const item = droppedItems.pop()
        if (!item) break
        try {
          const { x, y, z } = item.position.floored()
          const walking = bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
          try {
            await Promise.race([walking, timeoutAfter(10_000)])
          } catch (err) {
            bot.pathfinder.setGoal(null)
            await wait(1)
            throw err
          }
        } catch (err) {
          if ((err as Error).name !== 'NoPath') console.error(err)
        }
      }
    },
    getWool: async (): Promise<void> => {
      const actionStart = Date.now()
      bot.autoShepherd.addLastAction('getWool')
      const maxCycles = 5
      const unSheeredSheep = Object.values(bot.entities).filter(e => {
        return e.name === 'sheep' && e.position.distanceTo(bot.entity.position) < 45 && (e.metadata[13] as unknown as number) < 16 && (e.metadata[12] as unknown as boolean) == false
      })
      unSheeredSheep.sort((a, b) => {
        return b.position.distanceTo(bot.entity.position) - a.position.distanceTo(bot.entity.position)
      })
      if (unSheeredSheep.length === 0) return
      let cycel = 0
      while (unSheeredSheep.length !== 0 && actionStart + maxTimeInAction > Date.now() && cycel < maxCycles) {
        if (!bot.autoShepherd.isRunning()) return
        cycel++
        unSheeredSheep.sort((a, b) => {
          return b.position.distanceTo(bot.entity.position) - a.position.distanceTo(bot.entity.position)
        })
        const sheep = unSheeredSheep.pop()
        if (!sheep) break
        try {
          bot.autoShepherd.addLastAction('getWool->approaching sheep')
          const walking = bot.pathfinder.goto(new goals.GoalFollow(sheep, 1))
          try {
            await Promise.race([walking, timeoutAfter(20_000)])
          } catch (err) {
            bot.pathfinder.setGoal(null)
            await wait(1)
            throw err
          }
          const shears = bot.inventory.items().find(i => i.name.includes('shears'))
          if (!shears) {
            console.error('No more shears left')
            return
          }
          bot.autoShepherd.addLastAction('getWool->equipping shears')
          await Promise.race([bot.equip(shears.type, 'hand'), timeoutAfter(5_000)])
          await wait(100)
          bot.autoShepherd.addLastAction('getWool->shearing sheep')
          await bot.activateEntity(sheep)
        } catch (err) {
          if ((err as Error).name !== 'NoPath') console.error(err)
        }
      }
    },
    depositItems: async () => {
      bot.autoShepherd.addLastAction('depositItems')
      const woolId = mcData.itemsByName.wool.id
      let itemsDeposited = 0
      // console.info('Starting to deposit items')
      /** Deposit items in the chest with manual item clicking to counter lag/anti cheat */
      const tryDeposit = async (window: Chest): Promise<boolean> => {
        // @ts-ignore
        while (window.findInventoryItem(woolId) !== null) {
          if (!bot.autoShepherd.isRunning()) return false
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
        if (!bot.autoShepherd.isRunning()) return false
        let window: Chest | undefined = undefined
        try {
          const walking = bot.pathfinder.goto(new goals.GoalGetToBlock(d.x, d.y, d.z))
          try {
            await Promise.race([walking, timeoutAfter(20_000)])
          } catch (err) {
            bot.pathfinder.setGoal(null)
            await wait(1)
            throw err
          }
          const containerBlock = bot.blockAt(d)
          if (!containerBlock) {
            console.info('Invalid block at ' + d.x + ' ' + d.y + ' ' + d.z, ' expected something got nullish')
            continue
          }
          console.info(`Depositing items into chest at ${containerBlock.position.toString()}`)
          for (let i = 0; i < 3; i++) {
            if (!bot.autoShepherd.isRunning()) return false
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
      return isRunning || isAwaitingCycleStart
    },
    startSheering: () => {
      itemsDepositedTotal = 0
      console.info('Starting')
      bot.autoShepherd.addLastAction('startSheering')
      bot.autoShepherd.switchMode('running')
    },
    stopSheering: async () => {
      bot.autoShepherd.switchMode('stopped')
      bot.autoShepherd.addLastAction('stopSheering')
      isRunning = false
    },
    craftShears: async () => {
      bot.autoShepherd.addLastAction('craftShears')
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
      if (!bot.autoShepherd.isRunning()) return false
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
      if (!bot.autoShepherd.isRunning()) return false
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
      if (!bot.autoShepherd.isRunning()) return false
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
    switchMode: (mode: BotModes) => {
      if (mode === bot.autoShepherd.currentMode) {
        console.info('Not switching: Already in mode ' + mode)
        if (modeRequireCycling.includes(mode) && !bot.autoShepherd.isRunning()) bot.autoShepherd.start()
        return
      }
      console.info(`Switching from ${bot.autoShepherd.currentMode} to ${mode}`)
      lastMode = bot.autoShepherd.currentMode
      bot.autoShepherd.currentMode = mode
      if (modeRequireCycling.includes(mode)) bot.autoShepherd.start()
    },
    pause: () => {
      bot.autoShepherd.switchMode('paused')
      bot.autoShepherd.addLastAction('pause')
    },
    unpause: () => {
      if (bot.autoShepherd.currentMode !== 'paused') return
      bot.autoShepherd.switchMode(lastMode)
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

  const randomIdleAction = async () => {
    try {
      const randomAction = Math.floor(Math.random() * 2)
      if (randomAction === 0) {
        try {
          // Look at random direction
          const p = bot.lookAt(bot.entity.position.offset(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1))
          await Promise.race([timeoutAfter(5000), p])
        } catch (err) { }
      } else if (randomAction === 1) {
        // Move to random offset position
        const randomXZOffset = bot.entity.position.offset(Math.random() * 2 - 1, 0, Math.random() * 2 - 1)
        try {
          const p = bot.pathfinder.goto(new goals.GoalBlock(randomXZOffset.x, randomXZOffset.y, randomXZOffset.z))
          await Promise.race([timeoutAfter(5000), p])
        } catch (err) {
          bot.pathfinder.setGoal(null)
        }
      }
      return
    } catch (e) {
      console.error(e)
    }
  }

  const startCycling = async () => {
    while (true) {
      bot.autoShepherd.emitter.emit('alive')
      const lock = new LockToken()
      try {
        await Promise.race([cycle(lock), lock.waitAndTrebuchetThis(maxCycleTime)])
        bot.autoShepherd.emitter.emit('alive')
      } catch (err: Error | any) {
        if (err instanceof Error && err.message === LockToken.ErrorMsgTokenInUse) {
          console.info('Watchdog killed cycle for token', lock.token)
          return
        }
        console.error('Caught cycle error', err)
        await wait(2000)
      }
    }
  }

  const cycle = async (token: LockToken) => {
    isAwaitingCycleStart = false
    bot.autoShepherd.addLastAction('cycle start')
    if (!bot.proxy.botIsControlling) {
      await token.waitAndTrebuchetThis(5000)
      return
    }
    // Wait for the last cycle to finish then switch isRunning to false
    if (bot.autoShepherd.currentMode === 'stopped') {
      isRunning = false
      return
    }
    if (bot.autoShepherd.currentMode === 'paused') {
      await token.waitAndTrebuchetThis(1000)
      return
    }
    if (bot.autoShepherd.currentMode === 'idle') {
      await token.waitAndTrebuchetThis(1000)
      // Don't move all the time
      if (Math.random() < 0.1) {
        await randomIdleAction()
      }
      return
    }
    isRunning = true
    token.trebuchetThis()
    if (bot.inventory.emptySlotCount() < 2) await bot.autoShepherd.depositItems()
    token.trebuchetThis()
    const shears = bot.inventory.items().find(i => i.name.includes('shears'))
    if (!shears) {
      if (!bot.autoShepherd.autoCraftShears) {
        if (!bot.proxy.botIsControlling) return
        console.info('No more shears left')
        botExit(0)
      }
      console.info('Crafting new shears')
      const success = await bot.autoShepherd.craftShears()
      token.trebuchetThis()
      if (!success) {
        if (!bot.proxy.botIsControlling) return
        console.info('No more shears left. Crafting shears failed')
        botExit(1)
      }
    }
    // console.info('Getting wool')
    await bot.autoShepherd.getWool()
    await token.waitAndTrebuchetThis(1000)
    // console.info('Getting dropped items')
    await bot.autoShepherd.getItems()
    await token.waitAndTrebuchetThis(1000)
    bot.autoShepherd.emitter.emit('cycle')
    await token.waitAndTrebuchetThis(1000)
  }
}

class LockToken {
  private static currentToken?: string = undefined
  private static emitter = new EventEmitter()
  static ErrorMsgTokenInUse = 'Token outdated'
  token: string
  constructor() {
    this.token = uuid();
    LockToken.currentToken = this.token
    LockToken.emitter.emit('new_token', this.token)
  }

  /**
   * @returns true if the token is the current token
   */
  isCurrent(): boolean {
    if (!LockToken.currentToken) return true
    return this.token === LockToken.currentToken
  }

  /**
   * Did you know a Trebuchet can launch a 90kg projectile 300m?
   * @throws {Error} If the token is not the current one
   */
  trebuchetThis(): void | never {
    if (!this.isCurrent()) throw new Error(LockToken.ErrorMsgTokenInUse)
  }

  async waitAndTrebuchetThis(ms: number) {
    await Promise.race([wait(ms), invertPromise(once(LockToken.emitter, 'new_token'), new Error(LockToken.ErrorMsgTokenInUse))])
  }
}

async function invertPromise(arg: Promise<any>, throwError?: any): Promise<never> {
  const val = await arg
  if (throwError) throw throwError
  if (!val) throw 'timeout'
  throw val
}