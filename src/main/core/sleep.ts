/** Единственная реализация sleep для main-процесса (скрейп, auth-гейты). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
