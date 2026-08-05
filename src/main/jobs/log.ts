import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export function jobLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'download.log'), line + '\n')
  } catch {
    /* ignore */
  }
}
