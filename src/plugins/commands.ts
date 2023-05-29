import EventEmitter from "events";
import { Client } from "minecraft-protocol";
import readline from "readline";

export interface Commands {
  on(event: 'startSheering', listener: (client: Client | undefined) => void): this;
  on(event: 'stopSheering', listener: (client: Client | undefined) => void): this;
  on(event: 'deposit', listener: (client: Client | undefined) => void): this;
  on(event: 'exitBot', listener: (client: Client | undefined) => void): this;
  on(event: 'startCycle', listener: (client: Client | undefined) => void): this;
  on(event: 'currentMode', listener: (client: Client | undefined) => void): this;
  on(event: 'status', listener: (client: Client | undefined) => void): this;
  on(event: 'help', listener: (client: Client | undefined, commands: {notFound?: true, command: string, description: string} | Array<{command: string, description: string}>) => void): this;
  on(event: 'switchMode', listener: (client: Client | undefined, mode: string) => void): this;
  on(event: 'invalidUse', listener: (client: Client | undefined, command: string) => void): this;
  on(event: 'autologoff', listener: (client: Client | undefined, enabled: boolean) => void): this;
}

export class Commands extends EventEmitter {
  private static commandsInstance: Commands
  private rl: readline.Interface
  private coreCommands = [{
    command: 'link',
    description: 'Link your client into the proxy'
  }, {
    command: 'unlink',
    description: 'Unlink your client from the proxy'
  }]
  private commands: Array<{command: string, description: string}> = [
    ...this.coreCommands, {
    command: 'start',
    description: 'Start sheering',
  }, {
    command: 'stop',
    description: 'Switch to mode "stop"',
  }, {
    command: 'deposit',
    description: 'Deposit items',
  }, {
    command: 'quit',
    description: 'Quit the bot',
  }, {
    command: 'startCycle',
    description: 'Start the cycle',
  }, {
    command: 'currentMode',
    description: 'Show the current mode',
  }, {
    command: 'status',
    description: 'Show the status of the bot',
  }, {
    command: 'switchMode <mode>',
    description: 'Switch the mode to <mode>',
  }, {
    command: 'help',
    description: 'Show this help',
  }, {
    command: 'config autologoff <on|off>',
    description: 'Enable or disable bot auto logoff when a player disconnects',
  }]

  private constructor() {
    super()
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  }

  static getInstance() {
    if (!Commands.commandsInstance) {
      Commands.commandsInstance = new Commands()
    } 
    return Commands.commandsInstance
  }

  onLine(line: string, pclient?: Client) {
    line = line.trim()
    const cmd = line.split(' ').map(c => c.trim().toLowerCase()).filter(c => c.length > 0)
    if (line.startsWith('$')) line = line.substring(1)
    if (line === 'start') {
      this.emit('startSheering', pclient)
    } else if (line === 'stop') {
      this.emit('stopSheering', pclient)
    } else if (line === 'deposit') {
      this.emit('deposit', pclient)
    } else if (line === 'quit' || line === 'exit') {
      this.emit('exitBot', pclient)
    } else if (line === 'startCycle') {
      this.emit('startCycle', pclient)
    } else if (line === 'currentMode') {
      this.emit('currentMode', pclient)
    } else if (line === 'status') {
      this.emit('status', pclient)
    } else if (line.startsWith('help')) {
      if (cmd.length === 1) {
        this.emit('help', pclient, this.commands)
      } else {
        const command = this.commands.find(c => c.command.includes(cmd[1]))
        this.emit('help', pclient, command ?? { notFound: true, command: cmd[1], description: 'Not found' })
      }
    } else if (line.startsWith('switchMode')) {
      if (cmd.length > 1) {
        this.emit('switchMode', pclient, cmd[1])
      }
    } else if (cmd[0] === 'config') {
      if (cmd[1] === 'autologoff') {
        if (cmd[2]?.toLocaleLowerCase() === 'off') {
          this.emit('autologoff', pclient, false)
        } else if (cmd[2]?.toLocaleLowerCase() === 'on') {
          this.emit('autologoff', pclient, true)
        } else {
          this.emit('invalidUse', pclient, 'config autologoff <on|off>')
        }
      }
    }
  }

  flushListeners() {
    this.removeAllListeners()
  }

  exit() {
    this.rl.close()
  }

  init() {
    this.rl.on('line', (line) => {
      this.onLine(line)
    })
    
    this.rl.on('SIGINT', () => {
      this.emit('exit')
    })
  }
}
