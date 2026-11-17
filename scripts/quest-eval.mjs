// Evaluates an expression in the Playground tab of the Quest's browser and
// prints the result as JSON, or writes it to a file (large results get cut
// off on stdout): node scripts/quest-eval.mjs '<expression>' [file]
// Needs the Quest's devtools on localhost:9333 (scripts/quest.sh sets that
// up). THREE is not a global in the page: use camera.position.constructor.
const list = await (await fetch('http://localhost:9333/json')).json()
const tab = list.find(t => t.url.includes(':8300'))
if (!tab) {
  console.log('No Playground tab on the Quest')
  process.exit(1)
}
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate',
  params: {expression: process.argv[2], returnByValue: true}}))
ws.onmessage = async m => {
  const d = JSON.parse(m.data)
  if (d.id === 1) {
    const fs = await import('fs')
    fs.writeFileSync(process.argv[3] || '/dev/stdout', JSON.stringify(d.result.result.value ?? d.result))
    process.exit(0)
  }
}
