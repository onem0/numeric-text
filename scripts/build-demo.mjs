// Puts the demo page together in site/: the page with its fonts, and the built package beside it.
import { cp, rm } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const at = path => new URL(path, root)

await rm(at('site/'), { recursive: true, force: true })
await cp(at('demo/'), at('site/'), { recursive: true })
await cp(at('dist/'), at('site/dist/'), { recursive: true })
console.log('Demo built in site/')
