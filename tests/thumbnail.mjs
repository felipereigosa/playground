// Takes a snapshot (src/snapshot.js) of a staged scene: the watch on the left
// wrist, the menu open and the right hand holding the blaster as an icon.
// HOLD=60000 keeps the page open that long, for scripts/snapshot-pull.mjs:
// HOLD=60000 node scripts/emulator.mjs tests/thumbnail.mjs &
// DEVTOOLS=http://localhost:9223 node scripts/snapshot-pull.mjs test   (test1.json)
export const query = ''
export const size = [1920, 1080]

const copy = (page, i) => page.eval(
  `scene.getObjectByName('menu').children[${i}].children[0].getWorldPosition(new THREE.Vector3()).toArray()`)

async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/thumb', {recursive: true})
  await page.enterVR()
  await page.eval(`document.getElementById('VRButton').style.display = 'none'`)
  await page.head([0, 1.6, 0], [-25, 0, 0])
  // open the menu with the watch
  await page.hand('left', [-0.05, 1.25, -0.25], [0, -60, -90])
  await page.hand('right', [0.2, 1.2, -0.2], [-30, 30, 0])
  await page.press('right', 'squeeze')
  await page.tipTo('right', await page.pointOn('touch', [0, 0.1, 0]))
  await page.tipTo('right', await page.pointOn('touch', [0, -0.003, 0]))
  await page.frames(8)
  await page.tipTo('right', await page.pointOn('touch', [0, 0.15, 0]))
  await page.frames(8)
  await page.release('right', 'squeeze')
  await page.wait(Number(process.env.LOAD) || 8000)
  await page.head([0, 1.58, -0.12], [-42, 0, 0])
  await page.hand('left', [-0.12, 1.26, -0.2], [0, -60, -90])
  await page.hand('right', [0.3, 1.2, -0.2], [0, 0, 0])
  const at = await copy(page, 3)
  await handTo(page, 'right', at)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')`)
  await page.wait(600)
  await page.hand('left', [-0.2, 1.26, -0.2], [0, -80, -90])
  await page.hand('right', [0.3, 1.2, -0.2], [10, 45, 0])
  await handTo(page, 'right', [at[0], at[1] + 0.1, at[2] + 0.02])
  await page.shot('/tmp/thumb/before.png')
  // a snapshot as the trigger would take it (src/snapshot.js), left in the page
  await page.eval(`window.captureArmed = true`)
  await page.press('left', 'trigger')
  await page.release('left', 'trigger')
  console.log(await page.eval(`snapshots.length + ' snapshot, ' + (snapshots.at(-1).length / 1e6).toFixed(1) + ' MB'`))
  if (process.env.HOLD) await page.wait(Number(process.env.HOLD))
}
