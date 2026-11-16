// Run on the laptop: `npm run vr [gadget]`. Leaves Moonlight and puts the
// Quest straight into Playground in VR.
//
// 1. Closes Moonlight: its VR view hides any app opened over it. The laptop
//    keeps the Desktop session, and leaving VR resumes it.
// 2. Closes every tab in the Quest browser, through its devtools (forwarded
//    over adb), then opens Playground in a single new tab.
// 3. Clicks ENTER VR through the devtools, which counts as a user gesture,
//    so there is nothing to click in the headset.
import { execFileSync } from 'child_process'
import os from 'os'

const adb = process.env.ADB || `${os.homedir()}/Android/platform-tools/adb`
const devtoolsPort = 9333
// Gadgets to have in front of you on arriving, e.g. `npm run vr calculator,cube`,
// or `hands` (`hands:ar`) for the hand tracking demo
const gadgets = process.argv[2] || ''

const devices = execFileSync(adb, ['devices', '-l']).toString()
const quest = devices.split('\n').find(l => l.includes('model:Quest'))?.split(/\s+/)[0]
if (!quest) {
  console.log('The Quest is not connected to adb')
  process.exit(1)
}
const shell = (...args) => execFileSync(adb, ['-s', quest, 'shell', ...args]).toString()

const ip = Object.values(os.networkInterfaces()).flat()
  .find(a => a.family === 'IPv4' && !a.internal).address
// `npm run vr hands` opens the hand tracking demo instead (`hands:ar` with
// passthrough)
const query = gadgets.startsWith('hands') ? '?' + gadgets.replace(':', '=') : gadgets ? '?gadget=' + gadgets : ''
const url = `https://${ip}:8300/${query}`

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function tabs () {
  try {
    const list = await (await fetch(`http://localhost:${devtoolsPort}/json`)).json()
    return list.filter(t => t.type === 'page')
  }
  catch {
    return []  // browser not running, so no devtools socket
  }
}

shell('am', 'force-stop', 'com.gilleece.moonlightxr.debug')

// The window with the focus, e.g. com.oculus.vrshell/...HomeActivity
const focused = () => shell('dumpsys', 'window').match(/mCurrentFocus=Window\{\S+ \S+ (\S+)\}/)?.[1] || ''

// Closing Moonlight switches the headset to its home environment, and a
// browser opened during the switch can end up hidden behind it (seen in the
// log on 2026-11-11). So wait for home to take the focus first.
for (let i = 0; i < 20 && !focused().includes('vrshell'); i++) {
  await sleep(250)
}
await sleep(500)

async function openTab () {
  execFileSync(adb, ['-s', quest, 'forward', `tcp:${devtoolsPort}`,
                     'localabstract:chrome_devtools_remote'])
  for (const tab of await tabs()) {
    await fetch(`http://localhost:${devtoolsPort}/json/close/${tab.id}`)
  }
  shell('am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, 'com.oculus.browser')
}

// And if it still doesn't come to the front, open it again
for (let attempt = 1; attempt <= 3; attempt++) {
  await openTab()
  let shown = false
  for (let i = 0; i < 12 && !shown; i++) {
    await sleep(250)
    shown = focused().includes('com.oculus.browser')
  }
  if (shown) {
    console.log(`Opened ${url} on the Quest`)
    break
  }
  console.log(`The browser didn't come to the front (focus: ${focused()}), trying again`)
}

// The devtools socket may only appear once the browser has started
execFileSync(adb, ['-s', quest, 'forward', `tcp:${devtoolsPort}`,
                   'localabstract:chrome_devtools_remote'])

let tab
for (let i = 0; i < 40 && !tab; i++) {
  await sleep(250)
  tab = (await tabs()).find(t => t.url.startsWith(url))
}
if (!tab) {
  console.log('Could not find the tab to enter VR: click on the page instead')
  process.exit(1)
}

const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0
const pending = {}
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  pending[m.id]?.(m.result?.result?.value)
}
const evaluate = expression => new Promise(r => {
  pending[++id] = r
  ws.send(JSON.stringify({id, method: 'Runtime.evaluate',
                          params: {expression, userGesture: true, returnByValue: true}}))
})

// Wait for the page to finish loading its gadget and show the button
let entered = false
for (let i = 0; i < 60 && !entered; i++) {
  await sleep(500)
  entered = await evaluate(`(() => {
    const button = document.getElementById('VRButton')
    if (!button || button.textContent !== 'ENTER VR') return false
    button.click()
    return true
  })()`)
}
console.log(entered ? 'Entered VR' : 'The page never showed ENTER VR')
ws.close()
process.exit(entered ? 0 : 1)
