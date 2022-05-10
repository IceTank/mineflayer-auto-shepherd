/**
 * Convert a string to a date object.
 * Supported formats:
 * - MM-DDTHH:mm Month, date, hour, minute
 * - DDTHH Date and time as date and hour
 * - DDTHH:mm Date and time as date, hour and minute
 * - +HH:mm Offset as hour and minute in the future
 * - +DD:HH:mm Offset as day, hour and minute in the future
 * @param {string} string Time format in string
 */
export function toDate(string: string) {
  let targetDate = new Date()
  const mode = string[0] === '+' ? 'offset' : 'date'
  if (mode === 'offset') {
    const parts = string.replace(/\+/g, '').split(':')
    if (!parts) {
      return null
    }
    let days = 0
    let hours = 0
    let minutes = 0
    if (parts.length === 3) {
      days = parseInt(parts.shift()!, 10)
    }
    hours = parseInt(parts.shift()!, 10)
    minutes = parseInt(parts.shift()!, 10)
    if (Number.isNaN(days) || Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null
    }
    targetDate.setDate(targetDate.getDate() + days)
    targetDate.setHours(targetDate.getHours() + hours)
    targetDate.setMinutes(targetDate.getMinutes() + minutes)
  } else {
    const [partDate, partTime] = string.split('T')
    let month = null
    let day = null
    let hour = null
    let minute = null
    {
      const splitDates = partDate.split('-')
      if (splitDates.length === 2) {
        month = parseInt(splitDates.shift()!, 10)
      }
      day = parseInt(splitDates.shift()!, 10)
    }
    {
      if (!partTime) {
        return null
      }
      const splitTimes = partTime.split(':')
      hour = parseInt(splitTimes.shift()!, 10)
      if (splitTimes.length > 0) {
        minute = parseInt(splitTimes.shift()!, 10)
      }
    }
    if (month) targetDate.setMonth(month - 1)
    targetDate.setDate(day - 1)
    targetDate.setHours(hour)
    if (minute) targetDate.setMinutes(minute)
    if (targetDate < new Date()) {
      targetDate.setFullYear(targetDate.getFullYear() + 1)
    }
  }

  return targetDate
}
