// Host-side entry for the Harness bundle. Browser UI code lives in ./index.js;
// the package root must stay safe to import in the Node host process.
import { apply, inject, ROUTE } from '../src/index.mjs'

export const name = '@dsh-external/dsh-wallet-switcher'
export { apply, inject, ROUTE }
export default { name, inject, apply }
