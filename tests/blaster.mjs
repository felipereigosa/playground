// The blaster's grips: summoned with ?gadget=blaster, a hand closing away
// from its grips doesn't take it, the right hand takes it by grip_back and
// the left by grip_front (mirrored), each snapping the grip onto the
// controller: node scripts/emulator.mjs tests/blaster.mjs
export const query = 'gadget=blaster'
const root = `(() => { let r; scene.traverse(o => { if (o.userData.gadget === 'blaster') r = o }); return r })()`

// Moves a controller so that its object in the game is at a point (world)
const moveTo = (side, point) => `(() => {
  const p = xrDevice.controllers.${side}.position
  const g = avatar.controllers.${side}.getWorldPosition(new THREE.Vector3())
  const t = new THREE.Vector3(...${JSON.stringify(point)})
  p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z)
})()`

// World position of a grip, mirrored for the left hand, plus an offset
const gripAt = (name, side, offset = [0, 0, 0]) => `(() => {
  const grip = ${root}.getObjectByName('grip_${name}')
  const p = grip.position.clone()
  if ('${side}' === 'left') p.x *= -1
  return ${root}.localToWorld(p).add(new THREE.Vector3(...${JSON.stringify(offset)})).toArray()
})()`

// How far the controller is from where the grip says it should be: metres, degrees
const gripError = (name, side) => `(() => {
  const r = ${root}, grip = r.getObjectByName('grip_${name}')
  const p = grip.position.clone(), q = grip.quaternion.clone()
  if ('${side}' === 'left') { p.x *= -1; q.y *= -1; q.z *= -1 }
  const want = r.getWorldQuaternion(new THREE.Quaternion()).multiply(q)
  const c = avatar.controllers.${side}
  const d = r.localToWorld(p).distanceTo(c.getWorldPosition(new THREE.Vector3()))
  const a = want.angleTo(c.getWorldQuaternion(new THREE.Quaternion())) * 180 / Math.PI
  return [d.toFixed(4), a.toFixed(2)].join(' m ') + ' deg'
})()`

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0.6], [-20, 0, 0])
  await page.until(`!!${root}`)
  console.log('grips:', await page.eval(`${root}.children.filter(c => c.name.startsWith('grip_')).map(c => c.name).join(' ')`))

  // Near the muzzle, away from both grips: nothing
  const muzzle = await page.eval(`${root}.localToWorld(new THREE.Vector3(0, 0.03, -0.17)).toArray()`)
  await page.eval(moveTo('right', muzzle))
  await page.frames(3)
  await page.press('right', 'squeeze')
  await page.frames(5)
  console.log('away from grips, held:', await page.eval(`grab.heldIn('right')?.name ?? 'nothing'`))
  await page.release('right', 'squeeze')
  await page.frames(3)

  // Right hand 3 cm off grip_back: snaps onto it
  await page.eval(moveTo('right', await page.eval(gripAt('back', 'right', [0.02, 0.02, 0.01]))))
  await page.frames(3)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === 'blaster'`)
  await page.frames(20)
  console.log('right holds by', await page.eval(`grab.gripOf('right')`), 'error', await page.eval(gripError('back', 'right')))
  await page.hand('right', [0.12, 1.3, 0.25])
  await page.frames(10)
  await page.shot('/tmp/scen/b1.png')

  // Left hand on grip_front, mirrored: takes it from the right hand
  await page.eval(moveTo('left', await page.eval(gripAt('front', 'left', [-0.02, 0, 0.02]))))
  await page.frames(3)
  await page.press('left', 'squeeze')
  await page.until(`grab.heldIn('left')?.name === 'blaster'`)
  await page.frames(20)
  console.log('left holds by', await page.eval(`grab.gripOf('left')`), 'error', await page.eval(gripError('front', 'left')))
  await page.shot('/tmp/scen/b2.png')
  await page.release('left', 'squeeze')
  await page.release('right', 'squeeze')
}
