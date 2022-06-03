import { NewPingResult, ping } from 'minecraft-protocol'

export async function getQueueLengths(): Promise<{ main: { normal: number, priority: number }, test: { normal: number, priority: number } } | null> {
  function parseQueueLength(motd: NewPingResult) {
    const returnValue = {} as { 'main': { normal: number, priority: number }, 'test': { normal: number, priority: number } }
    for (const server of motd?.players?.sample ?? []) {
      const serverName = server.name.split(':')[0].replace(/§./g, '')
      const matches = server.name.match(/normal: (\d+), priority: (\d+)/)
      if (!matches) throw new Error('Could not parse queue length')
      const normal = parseInt(matches[1])
      const priority = parseInt(matches[2])
      if (isNaN(normal) || isNaN(priority)) throw new Error('Could not parse queue length got ' + server.name)
      if (!['main', 'test'].includes(serverName)) throw new Error('Invalid server name ' + serverName)
      // @ts-ignore
      returnValue[serverName] = {
        normal,
        priority
      }
    }
    return returnValue
  }

  const r = await ping({
    host: 'connect.2b2t.org',
    version: '1.12.2'
  }) as NewPingResult
  if (!r.players) return null
  return parseQueueLength(r)
}