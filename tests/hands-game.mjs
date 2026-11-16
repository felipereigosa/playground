// The playground with tracked hands instead of controllers: the watch on the
// left wrist, opened by pointing at it with the right index, a gadget taken
// out of the menu with a fist, and a calculator key pressed with the index.
// node scripts/emulator.mjs tests/hands-game.mjs (screenshots in /tmp/scen)
export const query = ''

const info = page => page.eval(`(() => {
  let real = null; scene.traverse(o => { if (o.userData.gadget) real = o })
  return {open: menu.isOpen(), held: grab.heldIn('right')?.name || null,
    tracked: hand.isTracked('right'), pointing: hand.isPointing('right'),
    real: real && {name: real.userData.gadget, scale: +real.scale.x.toFixed(3),
                   parent: real.parent.name || real.parent.type}}
})()`)

// Puts a side's grab point (hand.getPosition) at a world position
async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.hands['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

const raiseWrist = page => page.hand('left', [-0.05, 1.25, -0.25], [0, -60, -90])

async function touchWatch (page, pose) {
  await page.handPose('right', pose)
  await raiseWrist(page)
  await page.hand('right', [0.2, 1.2, -0.2], [-30, 30, 0])
  await page.tipTo('right', await page.pointOn('touch', [0, 0.1, 0]))
  await page.tipTo('right', await page.pointOn('touch', [0, 0.01, 0]))
  await page.frames(3)
  await page.tipTo('right', await page.pointOn('touch', [0, 0.15, 0]))
  await page.hand('right', [0.25, 1.0, 0], [0, 0, 0])
  await page.frames(15)
}

const root = name => `(() => { let r; scene.traverse(o => { if (o.userData.gadget === '${name}') r = o }); return r })()`

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.handPose('left', 'default')
  await page.handPose('right', 'default')
  await page.head([0, 1.6, 0], [-25, 0, 0])
  await raiseWrist(page)
  await page.hand('right', [0.25, 1.0, 0], [0, 0, 0])
  await page.frames(5)
  console.log('watch to left wrist (m)', await page.eval(`(() => {
    const t = scene.getObjectByName('touch').getWorldPosition(new THREE.Vector3())
    const h = scene.children.filter(o => o.name === 'tracked-hand')
    const w = new THREE.Vector3(), r = []
    for (const s of ['left', 'right']) r.push(+(hand.getPosition(s).distanceTo(t)).toFixed(3))
    return r
  })()`))
  await page.head([0, 1.45, 0], [-55, 0, 0])
  await page.shot('/tmp/scen/h0.png')
  await page.head([0, 1.6, 0], [-25, 0, 0])

  await touchWatch(page, 'default')
  console.log('touched with an open hand (closed)', JSON.stringify(await info(page)))
  await touchWatch(page, 'point')
  console.log('touched pointing (open)', JSON.stringify(await info(page)))
  await page.wait(1500)
  await page.shot('/tmp/scen/h1.png')

  // Take the calculator out with a fist, carry it away, open the hand
  await page.handPose('right', 'default')
  const copy = await page.eval(`scene.getObjectByName('menu').children[0].children[0].getWorldPosition(new THREE.Vector3()).toArray()`)
  await handTo(page, 'right', copy)
  console.log('slot under the open hand:', await page.eval(`menu.slotAt(hand.getPosition('right'))?.name`))
  await page.handPose('right', 'fist')
  console.log('fist reads as', JSON.stringify(await page.eval(`hand.trackedState('right')`)))
  // The gadget's code can take a while to load the first time
  await page.until(`grab.heldIn('right')`)
  console.log('fist on the copy', JSON.stringify(await info(page)))
  await page.hand('right', [0.45, 1.4, -0.3], [0, 0, 0])
  await page.frames(10)
  await page.handPose('right', 'default')
  await page.wait(800)
  console.log('opened away from the menu', JSON.stringify(await info(page)))
  await page.shot('/tmp/scen/h2.png')

  // Press ON/C and 7 with the right index, pointing
  await page.handPose('right', 'point')
  for (const key of ['button-clear', 'button-7']) {
    const above = await page.eval(`(() => { const b = ${root('calculator')}.getObjectByName('${key}'); return b.localToWorld(new THREE.Vector3(0, 0.25, 0)).toArray() })()`)
    const into = await page.eval(`(() => { const b = ${root('calculator')}.getObjectByName('${key}'); return b.localToWorld(new THREE.Vector3(0, -0.05, 0)).toArray() })()`)
    await page.tipTo('right', above); await page.tipTo('right', into); await page.frames(10)
    console.log(key, 'pressed:', await page.eval(`${root('calculator')}.getObjectByName('${key}').pressed`))
    await page.shot(`/tmp/scen/h3-${key}.png`)
    await page.tipTo('right', above); await page.frames(10)
  }
  await page.handPose('right', null)
  console.log('back to controllers', JSON.stringify(await info(page)))
}
