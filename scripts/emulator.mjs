// Drives Playground in the emulated headset (?emulate, see src/emulate.js)
// from the Linode, through the Chromium on the laptop (`laptop-chromium`,
// devtools on localhost:9222). Used by Claude to test VR code without the
// Quest. Run a scenario with `node scripts/emulator.mjs <scenario.mjs>`; the
// scenario's default export receives a page:
//
//   page.eval(expression)        result of an expression in the page
//   page.enterVR()               clicks ENTER VR (as a user gesture)
//   page.head(position, euler)   moves the emulated headset
//   page.hand(side, position, euler)
//   page.press(side, button) / page.release(side, button)
//       button: trigger, squeeze, thumbstick, x-button, y-button,
//       a-button, b-button
//   page.frames(n)               waits n animation frames
//   page.shot(file)              screenshot (png)
//   page.logs                    console messages so far
//
// Positions are [x, y, z] in metres in the XR reference space (floor at 0),
// rotations [x, y, z] in degrees, applied in YXZ order.
import fs from 'fs'
import path from 'path'

const devtools = process.env.DEVTOOLS || 'http://localhost:9223'
const base = process.env.PLAYGROUND_URL || 'https://localhost:8300'

export async function open (query = '') {
  const url = `${base}/?emulate${query ? '&' + query : ''}`
  const list = await (await fetch(`${devtools}/json`)).json()
  // Reuse a tab, so Chromium never runs out of them and quits
  let tab = list.find(t => t.type === 'page')
  if (!tab) {
    tab = await (await fetch(`${devtools}/json/new`, {method: 'PUT'})).json()
  }
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)

  let id = 0
  const pending = {}
  const logs = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending[m.id]) {
      pending[m.id](m)
      delete pending[m.id]
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(m.params.args.map(a => a.value ?? a.description).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description
                                ?? m.params.exceptionDetails.text))
    }
  }
  const send = (method, params = {}) => new Promise(r => {
    pending[++id] = r
    ws.send(JSON.stringify({id, method, params}))
  })

  await send('Page.bringToFront')
  await send('Runtime.enable')
  await send('Security.setIgnoreCertificateErrors', {ignore: true})
  await send('Emulation.setDeviceMetricsOverride',
             {width: 1280, height: 800, deviceScaleFactor: 1, mobile: false})
  await send('Page.navigate', {url})

  const page = {
    logs,
    async eval (expression) {
      const m = await send('Runtime.evaluate', {expression, awaitPromise: true,
                                                returnByValue: true, userGesture: true})
      if (m.result?.exceptionDetails) {
        throw new Error(m.result.exceptionDetails.exception?.description
                        ?? m.result.exceptionDetails.text)
      }
      return m.result?.result?.value
    },
    async wait (ms) {
      await new Promise(r => setTimeout(r, ms))
    },
    async until (expression, ms = 15000) {
      for (let t = 0; t < ms; t += 200) {
        if (await page.eval(`(() => { try { return !!(${expression}) } catch { return false } })()`)) {
          return
        }
        await page.wait(200)
      }
      throw new Error(`timed out waiting for ${expression}`)
    },
    async enterVR () {
      await page.until(`document.getElementById('VRButton')?.textContent === 'ENTER VR'`)
      await page.eval(`document.getElementById('VRButton').click()`)
      await page.until(`renderer.xr.isPresenting`)
      await page.frames(5)
    },
    async frames (n = 1) {
      await page.eval(`new Promise(r => {
        let left = ${n}
        const tick = () => --left <= 0 ? r() : renderer.xr.getSession().requestAnimationFrame(tick)
        renderer.xr.getSession().requestAnimationFrame(tick)
      })`)
    },
    async head (position, euler = [0, 0, 0]) {
      await page.eval(`(() => {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          ...${JSON.stringify(euler)}.map(THREE.MathUtils.degToRad), 'YXZ'))
        xrDevice.position.set(...${JSON.stringify(position)})
        xrDevice.quaternion.set(q.x, q.y, q.z, q.w)
      })()`)
      await page.frames(2)
    },
    async hand (side, position, euler = [0, 0, 0]) {
      await page.eval(`(() => {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          ...${JSON.stringify(euler)}.map(THREE.MathUtils.degToRad), 'YXZ'))
        const c = xrDevice.controllers['${side}']
        c.position.set(...${JSON.stringify(position)})
        c.quaternion.set(q.x, q.y, q.z, q.w)
      })()`)
      await page.frames(2)
    },
    // Moves a controller (keeping its rotation) so that the index fingertip
    // (where hand.getTipPosition puts it) is at a world position
    async tipTo (side, target) {
      for (let i = 0; i < 2; i++) {
        await page.eval(`(() => {
          const tip = hand.getTipPosition('${side}')
          const delta = new THREE.Vector3(...${JSON.stringify(target)}).sub(tip)
          const p = xrDevice.controllers['${side}'].position
          p.set(p.x + delta.x, p.y + delta.y, p.z + delta.z)
        })()`)
        await page.frames(2)
      }
    },
    // A point in world space: an object's position plus an offset along its
    // own axes (metres)
    async pointOn (name, offset = [0, 0, 0]) {
      return page.eval(`(() => {
        const o = scene.getObjectByName('${name}')
        return o.localToWorld(new THREE.Vector3(...${JSON.stringify(offset)})
          .divide(o.getWorldScale(new THREE.Vector3()))).toArray()
      })()`)
    },
    async press (side, button) {
      await page.eval(`xrDevice.controllers['${side}'].updateButtonValue('${button}', 1)`)
      await page.frames(3)
    },
    async release (side, button) {
      await page.eval(`xrDevice.controllers['${side}'].updateButtonValue('${button}', 0)`)
      await page.frames(3)
    },
    async shot (file) {
      const m = await send('Page.captureScreenshot', {format: 'png'})
      fs.writeFileSync(file, Buffer.from(m.result.data, 'base64'))
    },
    close () {
      ws.close()
    },
  }
  try {
    await page.until(`window.THREE && window.renderer && window.worldReady`)
  }
  catch (error) {
    console.log(logs.join('\n'))
    ws.close()
    throw error
  }
  return page
}

if (process.argv[1] === new URL(import.meta.url).pathname && process.argv[2]) {
  // A scenario that hangs (a frame wait with no VR session) ends here
  setTimeout(() => { console.log('FAILED: timed out'); process.exit(1) }, 120000).unref()
  const scenario = await import(path.resolve(process.argv[2]))
  let page
  try {
    page = await open(scenario.query || '')
    await scenario.default(page)
  }
  catch (error) {
    console.log('FAILED:', error.message)
    process.exitCode = 1
  }
  finally {
    if (page) {
      console.log(page.logs.filter(l => !/HMR|webpack-dev-server/.test(l)).join('\n'))
      page.close()
    }
  }
}
