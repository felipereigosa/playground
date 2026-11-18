// Brings the snapshots taken in the headset (src/snapshot.js, it keeps the
// last three) to assets/snapshots/<name>1.json, <name>2.json, ... in the
// order they were taken: node scripts/snapshot-pull.mjs [name]
// All are fetched before any is written there: a new file in assets makes
// the dev server reload the page, and the reload empties the headset's list.
// Needs the Quest's devtools on localhost:9333 (scripts/quest.sh); DEVTOOLS
// names another browser, the test one for instance.
import fs from 'fs'

const devtools = process.env.DEVTOOLS || 'http://localhost:9333'
const list = await (await fetch(`${devtools}/json`)).json()
const tab = list.find(t => t.type === 'page' && t.url.includes(':8300'))
if (!tab) {
  console.log('No Playground tab')
  process.exit(1)
}
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0
const pending = {}
ws.onmessage = m => {
  const d = JSON.parse(m.data)
  pending[d.id]?.(d.result?.result?.value)
}
const evaluate = expression => new Promise(r => {
  pending[++id] = r
  ws.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}))
})

const count = await evaluate('window.snapshots?.length || 0')
if (!count) {
  console.log('No snapshot taken yet')
  process.exit(1)
}
// In pieces: one message of the whole thing is too much for the devtools
const STEP = 4e6
const name = process.argv[2] || 'snapshot'
const fetched = []
for (let i = 0; i < count; i++) {
  const length = await evaluate(`window.snapshots[${i}].length`)
  const file = `/tmp/${name}${i + 1}.json`
  const out = fs.openSync(file, 'w')
  for (let at = 0; at < length; at += STEP) {
    fs.writeSync(out, await evaluate(`window.snapshots[${i}].slice(${at}, ${at + STEP})`))
  }
  fs.closeSync(out)
  fetched.push(file)
  console.log(`${name}${i + 1}: ${(length / 1e6).toFixed(1)} MB`)
}
fs.mkdirSync('assets/snapshots', {recursive: true})
for (const file of fetched) {
  fs.copyFileSync(file, `assets/snapshots/${file.slice(5)}`)
  fs.unlinkSync(file)
}
process.exit(0)
