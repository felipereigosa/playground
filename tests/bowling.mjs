// Bowling: deployed with ?gadget=, the ball is taken (and turns into its
// grip's hold), let go and sent at the pins; the roll ends, the fallen pins
// are counted and taken away, the ball floats home; after a second roll all
// ten stand again; with the menu open a hand on a pin gathers the set, and
// it deploys again where the icon is let go:
// node scripts/emulator.mjs tests/bowling.mjs (screenshots in /tmp/scen)
export const query = 'gadget=bowling'

const all = `[...scene.children, ...avatar.controllers.left.children, ...avatar.controllers.right.children].filter(o => o.userData.gadget === 'bowling' && o.body)`
const ball = `${all}.find(o => o.name === 'ball')`
const pins = `${all}.filter(o => o.name === 'pin')`
const standing = `${pins}.filter(p => p.parent === scene && new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion).y > 0.9).length`

async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

// Takes the ball a little off its middle, lets it go and sends it off
async function roll (page, side, velocity, shot) {
  const at = await page.eval(`${ball}.getWorldPosition(new THREE.Vector3()).toArray()`)
  await handTo(page, side, [at[0] + 0.07, at[1] + 0.05, at[2] + 0.04])
  await page.press(side, 'squeeze')
  await page.frames(15)
  console.log(side, 'hand: ball in', await page.eval(`${ball}.parent.name || 'the scene'`), 'grip off the hand by',
    await page.eval(`(() => { const b = ${ball}, c = avatar.controllers['${side}']
      const g = grab.gripsFor('${side}', {root: b})[0]
      const p = b.localToWorld(g.position.clone()).distanceTo(c.getWorldPosition(new THREE.Vector3()))
      const q = b.getWorldQuaternion(new THREE.Quaternion()).multiply(g.quaternion).angleTo(c.getWorldQuaternion(new THREE.Quaternion()))
      return p.toFixed(3) + ' m, ' + (q * 180 / Math.PI).toFixed(1) + ' deg' })()`))
  if (shot) {
    await page.shot(shot)
  }
  await page.release(side, 'squeeze')
  await page.frames(2)
  await page.eval(`(() => { const b = ${ball}.body; b.velocity.set(...${JSON.stringify(velocity)}); b.wakeUp() })()`)
}

const lane = (page, what) => page.eval(`(() => { const lane = ${ball}.lane; return ${what} })()`)

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0.6], [-15, 0, 0])
  await page.until(`window.worldReady`)
  await page.frames(5)
  console.log('deployed: pins', await page.eval(`${pins}.length`), 'standing', await page.eval(standing),
    'ball at', await page.eval(`${ball}.position.toArray().map(v => v.toFixed(2)).join(' ')`),
    'head pin at', await page.eval(`${pins}[0].position.toArray().map(v => v.toFixed(2)).join(' ')`))
  await page.wait(1500)
  console.log('after 1.5 s still standing', await page.eval(standing), 'ball height', await page.eval(`${ball}.position.y.toFixed(2)`))

  await page.head([0, 1.6, 0.6], [-25, 0, 0])
  await roll(page, 'right', [0.25, 0, -7], '/tmp/scen/b1.png')
  await page.head([0, 1.6, -2], [-15, 0, 0])
  await page.wait(900)
  await page.frames(2)
  await page.shot('/tmp/scen/b2.png')
  await page.until(`!${ball}.lane.roll`, 15000)
  console.log('first roll over: throws', await lane(page, 'lane.throws'), 'sign', await lane(page, 'lane.signs[0]?.userData.text'),
    'standing', await page.eval(standing))
  await page.wait(1500)
  await page.frames(2)
  console.log('pins left in the world', await page.eval(`${pins}.filter(p => p.parent).length`),
    'ball at', await page.eval(`${ball}.position.toArray().map(v => v.toFixed(2)).join(' ')`),
    'with a body in the world', await page.eval(`!!${ball}.body.world`))

  await roll(page, 'left', [-0.3, 0, -6])
  await page.until(`!${ball}.lane.roll`, 15000)
  console.log('second roll over: throws', await lane(page, 'lane.throws'), 'sign', await lane(page, 'lane.signs.at(-1)?.userData.text'),
    'setting up', await lane(page, 'lane.rerackAt !== null'))
  await page.wait(2500)
  await page.frames(3)
  console.log('set up again: standing', await page.eval(standing), 'throws', await lane(page, 'lane.throws'),
    'farthest off its spot', await page.eval(`Math.max(...${pins}.map(p => p.position.distanceTo(p.spot))).toFixed(3)`))
  await page.shot('/tmp/scen/b3.png')

  // A roll that fells nothing is not counted
  await roll(page, 'right', [3, 0, 0])
  await page.until(`!${ball}.lane.roll`, 15000)
  console.log('a miss: throws', await lane(page, 'lane.throws'), 'standing', await page.eval(standing))

  // Gathered by a pin with the menu open, deployed again elsewhere
  await page.head([0, 1.6, 0.6], [-15, 0, 0])
  await page.eval(`menu.toggle()`)
  await page.frames(10)
  const pin = await page.eval(`${pins}[0].position.toArray()`)
  await handTo(page, 'left', [pin[0], 0.15, pin[2]])
  await page.press('left', 'squeeze')
  await page.wait(700)
  await page.frames(3)
  console.log('gathered: held', await page.eval(`grab.heldIn('left')?.name`), 'parts left', await page.eval(`${all}.length`))
  await page.hand('left', [-0.4, 1.2, 0.2])
  await page.frames(5)
  await page.release('left', 'squeeze')
  await page.wait(900)
  await page.frames(3)
  console.log('deployed again: parts', await page.eval(`${all}.length`), 'standing', await page.eval(standing),
    'bodies in the world', await page.eval(`world && ${pins}.filter(p => p.body.world).length`))
  console.log('errors:', page.logs?.filter?.(l => /error/i.test(String(l))).slice(0, 5).join(' | ') || 'none')
}
