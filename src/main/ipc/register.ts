import { browserManager } from '../browser/manager'
import { registerOrdersHandlers } from './handlers/orders'
import { registerPackagesHandlers } from './handlers/packages'
import { registerProductsHandlers } from './handlers/products'
import { registerShellHandlers } from './handlers/shell'

export function registerIpc(): void {
  registerOrdersHandlers()
  registerPackagesHandlers()
  registerProductsHandlers()
  registerShellHandlers()
}

export async function shutdownBrowser(): Promise<void> {
  await browserManager.close()
}
