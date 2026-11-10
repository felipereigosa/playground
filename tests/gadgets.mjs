// The calculator's keys, the cube's two-handed grab and a tile grab:
// node scripts/emulator.mjs tests/gadgets.mjs (screenshots in /tmp/scen)
export const query = 'gadget=calculator,tiles,cube'
async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}
const root = name => `(() => { let r; scene.traverse(o => { if (o.userData.gadget === '${name}') r = o }); return r })()`
export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.7, 0.5], [-35, 0, 0])
  await page.hand('left', [-0.6, 0.9, 0.3]); await page.hand('right', [0.6, 0.9, 0.3])
  await page.shot('/tmp/scen/g0.png')

  // calculator: press ON/C then 7 with the right index finger
  await page.press('right', 'squeeze')
  for (const key of ['button-clear', 'button-7']) {
    const above = await page.eval(`(() => { const b = ${root('calculator')}.getObjectByName('${key}'); return b.localToWorld(new THREE.Vector3(0, 0.25, 0)).toArray() })()`)
    const into = await page.eval(`(() => { const b = ${root('calculator')}.getObjectByName('${key}'); return b.localToWorld(new THREE.Vector3(0, -0.05, 0)).toArray() })()`)
    await page.tipTo('right', above); await page.tipTo('right', into); await page.frames(10)
    console.log(key, 'pressed:', await page.eval(`${root('calculator')}.getObjectByName('${key}').pressed`))
    await page.tipTo('right', above); await page.frames(10)
  }
  await page.release('right', 'squeeze')
  await page.head([-0.4, 1.4, 0.0], [-60, 0, 0]); await page.shot('/tmp/scen/g1.png')

  // cube: right hand picks it up, left hand grabs too, turn, both let go
  const cube = await page.eval(`${root('cube')}.getWorldPosition(new THREE.Vector3()).toArray()`)
  await handTo(page, 'right', cube)
  await page.press('right', 'squeeze')
  console.log('cube held by', await page.eval(`grab.holder(grab.heldIn('right'))`), await page.eval(`${root('cube')}.parent.name`))
  await handTo(page, 'right', [cube[0] + 0.08, cube[1], cube[2]])
  await handTo(page, 'left', [cube[0] - 0.12, cube[1], cube[2]])
  await page.press('left', 'squeeze')
  console.log('cube after second hand:', await page.eval(`${root('cube')}.parent.type`))
  await handTo(page, 'left', [cube[0] - 0.12, cube[1] + 0.1, cube[2] + 0.04])
  await page.frames(5)
  await page.release('left', 'squeeze'); await page.release('right', 'squeeze')
  await page.wait(800)
  console.log('cube after both let go:', await page.eval(`${root('cube')}.parent.type`))

  // tiles: grab a tile next to the hole and slide it
  const result = await page.eval(`(() => {
    const box = ${root('tiles')}
    const tiles = []; box.traverse(o => { if (o.name.startsWith('tile_') && o.parent === box) tiles.push(o) })
    return tiles.map(t => [t.name, t.getWorldPosition(new THREE.Vector3()).toArray(), t.position.toArray()])
  })()`)
  let moved = false
  for (const [name, world, local] of result) {
    await handTo(page, 'right', world)
    await page.press('right', 'squeeze')
    const taking = await page.eval(`grab.gadgetOfHand('right')?.name`)
    await page.release('right', 'squeeze')
    if (taking === 'tiles') { console.log('tile grab taken by tiles on', name); moved = true; break }
  }
  if (!moved) console.log('no tile grab taken')
}
