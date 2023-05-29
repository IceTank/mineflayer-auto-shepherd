import { Client } from "minecraft-protocol"
import { InspectorProxy } from "mineflayer-proxy-inspector"
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
  sendStatusMessage(proxy: InspectorProxy, client: Client, loginDate: Date, currentMode: string) {
    if (!this.MessageBuilder) return
    const connectedAt = loginDate ? loginDate.getTime() : 0
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
    const root = new this.MessageBuilder()
    this.addPrefix(root)

    const onlineTime = new this.MessageBuilder()
    onlineTime.setColor('green').setText(`Connected since ${hourDisplay}${minutesDisplay}${secondsDisplay}s `)
    root.addExtra(onlineTime)

    const messageMode = new this.MessageBuilder()
    messageMode.setColor('white').setText(`Current status: ${currentMode}`)
    root.addExtra(messageMode)

    const messageAutoLogoff = new this.MessageBuilder()
    messageAutoLogoff.setColor('white').setText(`Auto logoff: ${proxy.proxyOptions.botStopOnLogoff ? 'on' : 'off'}`)
    root.addExtra(messageAutoLogoff)

    this.sendMessage(client, root)
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
