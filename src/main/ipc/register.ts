import { browserManager } from '../browser/manager'
import { registerOrdersHandlers } from './handlers/orders'
import { registerProductsHandlers } from './handlers/products'
import { registerShellHandlers } from './handlers/shell'

export function registerIpc(): void {
  registerOrdersHandlers()
  registerProductsHandlers()
  registerShellHandlers()
}

export async function shutdownBrowser(): Promise<void> {
  await browserManager.close()
}
