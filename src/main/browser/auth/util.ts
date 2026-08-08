export type AuthProgressFn = (data: Record<string, unknown>) => void

export type AuthGateOpts = {
  progress?: AuthProgressFn
  timeoutMs?: number
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
