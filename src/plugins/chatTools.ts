import { Client } from "minecraft-protocol"
import type { MessageBuilder as TypeMessageBuilder } from 'prismarine-chat'

export class ChatTools {
  private MessageBuilder: typeof TypeMessageBuilder

  constructor(MessageBuilder: typeof TypeMessageBuilder) {
    this.MessageBuilder = MessageBuilder
  }

  /**
   * Send how long the proxy has been connected to the server
   * @param client The connecting client
   */
  sendStatusMessage(client: Client, loginDate: Date, currentMode: string) {
    if (!this.MessageBuilder) return
    const root = new this.MessageBuilder()
    this.addPrefix(root)

    const onlineTime = new this.MessageBuilder()
    onlineTime.setColor('white').setText(`Connected since `)
    root.addExtra(onlineTime)
    const onlineTime2 = new this.MessageBuilder()
    onlineTime2.setColor('gold').setText(`${this.getTimeConnectedString(loginDate)}`)
    root.addExtra(onlineTime2)

    const messageMode = new this.MessageBuilder()
    messageMode.setColor('white').setText(` Current status:`)
    root.addExtra(messageMode)
    const messageMode2 = new this.MessageBuilder()
    let color: 'green' | 'red' | 'yellow' = 'green'
    if (currentMode === 'stopped') {
      color = 'red'
    } else if (currentMode === 'idle') {
      color = 'yellow'
    }
    messageMode2.setColor(color).setText(` ${currentMode}`)
    root.addExtra(messageMode2)

    this.sendMessage(client, root)
  }

  getTimeConnectedString(startDate: Date) {
    const connectedAt = startDate ? startDate.getTime() : 0
    const sec = Math.floor((Date.now() - connectedAt) / 1000)
    const hours = Math.floor(sec / (60 * 60))
    const min = Math.floor((sec - hours * 60 * 60) / 60)
    const secondsDisplay = sec % 60
    let minutesDisplay = ''
    let hourDisplay = ''
    if ((min % 60) > 0) {
      minutesDisplay =  (min % 60) + 'm '
      if (hours > 0) {
        hourDisplay = hours + 'h '
      }
    }
    return `${hourDisplay}${minutesDisplay}${secondsDisplay}s`
  }

  sendMessage (client: Client, message: TypeMessageBuilder, withPrefix = true) {
    // console.info(root.toJSON())
    const mojangMessage = {
      message: JSON.stringify(message.toJSON()),
      position: 1
    }
    console.info('Welcome message', mojangMessage)
    client.write('chat', mojangMessage)
  }

  addPrefix (message: TypeMessageBuilder) {
    message.setColor('gold').setText('Proxy >> ')
  }
}
