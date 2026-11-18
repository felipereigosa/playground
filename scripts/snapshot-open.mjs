// Opens a snapshot (src/snapshot.js) in the test Chromium on the laptop, in a
// background tab, past the warning about the dev server's own certificate:
//   node scripts/snapshot-open.mjs <name>
// Saves what the open snapshot tab shows now as a 1920 x 1080 png:
//   node scripts/snapshot-open.mjs --save <file.png>
// Needs that Chromium on localhost:9222 (`laptop-chromium` checks).
import fs from 'fs'

const devtools = 'http://localhost:9222'
const base = process.env.PLAYGROUND_URL || 'https://localhost:8300'

async function connect (url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = {}
  ws.onmessage = m => {
    const d = JSON.parse(m.data)
    pending[d.id]?.(d.result)
  }
  return (method, params = {}) => new Promise(r => {
    pending[++id] = r
    ws.send(JSON.stringify({id, method, params}))
  })
}
const tabs = async () => (await (await fetch(`${devtools}/json`)).json()).filter(t => t.type === 'page')

if (process.argv[2] === '--save') {
  const tab = (await tabs()).find(t => t.url.includes('snapshot='))
  if (!tab) {
    console.log('No snapshot tab open')
    process.exit(1)
  }
  const send = await connect(tab.webSocketDebuggerUrl)
  const shot = await send('Runtime.evaluate', {returnByValue: true,
    expression: `renderer.render(scene, camera), renderer.domElement.toDataURL('image/png')`})
  fs.writeFileSync(process.argv[3], Buffer.from(shot.result.value.split(',')[1], 'base64'))
  console.log(`${process.argv[3]}: ${tab.url}`)
}
else {
  const url = `${base}/?snapshot=${process.argv[2] || 'snapshot'}`
  const browser = await connect((await (await fetch(`${devtools}/json/version`)).json()).webSocketDebuggerUrl)
  // In the background: the window must not come to the front of his work
  const {targetId} = await browser('Target.createTarget', {url: 'about:blank', background: true})
  const send = await connect((await tabs()).find(t => t.id === targetId).webSocketDebuggerUrl)
  await send('Security.setIgnoreCertificateErrors', {ignore: true})
  await send('Page.navigate', {url})
  let ready = false
  for (let i = 0; i < 60 && !ready; i++) {
    await new Promise(r => setTimeout(r, 1000))
    ready = (await send('Runtime.evaluate', {expression: 'window.worldReady === true', returnByValue: true})).result?.value
  }
  console.log(ready ? `open: ${url}` : `not ready after a minute: ${url}`)
}
process.exit(0)
