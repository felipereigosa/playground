// The blaster's grips: summoned with ?gadget=blaster, a hand closing away
// from its grips doesn't take it, the right hand takes it by grip_back and
// the left by grip_front (mirrored), each snapping the grip onto the
// controller; holding the back trigger fires until let go; both hands pull the halves apart with
// a beam between them, and either letting go docks them again:
// node scripts/emulator.mjs tests/blaster.mjs
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

  // Hold the back hand's trigger: it keeps firing until let go
  await page.press('right', 'trigger')
  await page.eval(`new Promise(r => setTimeout(r, 700))`)
  await page.frames(1)
  await page.head([0.3, 1.45, 0.2], [-10, 70, 0])
  await page.frames(1)
  await page.shot('/tmp/scen/fire.png')
  console.log('plume while held:', await page.eval(`(() => { let p; scene.traverse(o => { if (o.material?.uniforms?.uHeat) p = o }); return p.visible + ' heat ' + p.material.uniforms.uHeat.value.toFixed(2) })()`))
  await page.release('right', 'trigger')
  await page.frames(2)
  const held = await page.eval(`${root}.userData.shots`)
  await page.eval(`new Promise(r => setTimeout(r, 400))`)
  await page.frames(2)
  console.log('shots while held ~0.8 s:', held, 'after letting go:', await page.eval(`${root}.userData.shots`))
  await page.head([0, 1.6, 0.6], [-20, 0, 0])

  // Left hand on grip_front, mirrored: the halves part, beam between them
  await page.eval(moveTo('left', await page.eval(gripAt('front', 'left', [-0.02, 0, 0.02]))))
  await page.frames(3)
  await page.press('left', 'squeeze')
  await page.frames(5)
  console.log('right still holds:', await page.eval(`grab.heldIn('right')?.name`), 'left works:', await page.eval(`grab.gadgetOfHand('left')?.name`))
  // Pull the left hand 25 cm further along the gun
  const ahead = await page.eval(`(() => { const r = ${root}; const d = new THREE.Vector3(0, 0, -1).transformDirection(r.matrixWorld); return avatar.controllers.left.getWorldPosition(new THREE.Vector3()).addScaledVector(d, 0.25).toArray() })()`)
  await page.eval(moveTo('left', ahead))
  await page.frames(10)
  const gap = `(() => { const r = ${root}; const a = r.getObjectByName('socket_rear').getWorldPosition(new THREE.Vector3()), b = r.getObjectByName('socket_front').getWorldPosition(new THREE.Vector3()); return a.distanceTo(b).toFixed(3) })()`
  console.log('stretched: gap', await page.eval(gap), 'beam', await page.eval(`${root}.getObjectByName('beam').visible`))
  console.log('front grip on left hand, error', await page.eval(`(() => {
    const r = ${root}, f = r.getObjectByName('front'), g = r.getObjectByName('grip_front')
    const p = g.position.clone(); p.x *= -1
    return f.localToWorld(p).distanceTo(avatar.controllers.left.getWorldPosition(new THREE.Vector3())).toFixed(4)
  })()`))
  await page.head([0.35, 1.45, 0.45], [-15, 40, 0])
  await page.frames(5)
  await page.shot('/tmp/scen/b2.png')
  await page.press('right', 'trigger')
  await page.frames(6)
  await page.release('right', 'trigger')
  console.log('shots after stretched trigger:', await page.eval(`${root}.userData.shots`))
  await page.shot('/tmp/scen/b3.png')
  // The front hand's trigger doesn't fire
  await page.press('left', 'trigger')
  await page.frames(2)
  await page.release('left', 'trigger')
  console.log('shots after front trigger:', await page.eval(`${root}.userData.shots`))

  // Left lets go: the rear stays put in the right hand, the front slides back
  const pose = half => `(() => { const h = ${root}.getObjectByName('${half}'); h.updateMatrixWorld(true); const c = avatar.controllers[h.name === 'rear' ? 'right' : 'left']; return c.matrixWorld.clone().invert().multiply(h.matrixWorld).elements })()`
  const moved = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))).toFixed(5)
  let before = await page.eval(pose('rear'))
  await page.release('left', 'squeeze')
  await page.frames(2)
  let during = await page.eval(pose('rear'))
  await page.frames(30)
  console.log('rear moved in the hand: 2 frames', moved(before, during), 'end', moved(before, await page.eval(pose('rear'))), 'grip error', await page.eval(gripError('back', 'right')))
  console.log('left let go: gap', await page.eval(gap), 'beam', await page.eval(`${root}.getObjectByName('beam').visible`), 'right holds', await page.eval(`grab.heldIn('right')?.name`))

  // Again, then the right hand (the holder) lets go: the left keeps it whole
  await page.eval(moveTo('left', await page.eval(gripAt('front', 'left'))))
  await page.frames(3)
  await page.press('left', 'squeeze')
  await page.frames(3)
  await page.eval(moveTo('left', await page.eval(`(() => { const r = ${root}; const d = new THREE.Vector3(0, 0, -1).transformDirection(r.matrixWorld); return avatar.controllers.left.getWorldPosition(new THREE.Vector3()).addScaledVector(d, 0.2).add(new THREE.Vector3(-0.2, 0, 0.15)).toArray() })()`)))
  await page.frames(10)
  console.log('stretched again: gap', await page.eval(gap))
  before = await page.eval(pose('front'))
  await page.release('right', 'squeeze')
  await page.frames(2)
  during = await page.eval(pose('front'))
  await page.frames(30)
  console.log('front moved in the hand: 2 frames', moved(before, during), 'end', moved(before, await page.eval(pose('front'))))
  console.log('right let go: left holds', await page.eval(`grab.heldIn('left')?.name`), 'by', await page.eval(`grab.gripOf('left')`), 'gap', await page.eval(gap), 'error', await page.eval(gripError('front', 'left')))
  await page.shot('/tmp/scen/b4.png')
  await page.release('left', 'squeeze')
  await page.frames(5)

  // Both hands let go one right after the other: the gun stays near the hands
  await page.eval(moveTo('right', await page.eval(gripAt('back', 'right'))))
  await page.frames(3)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === 'blaster'`)
  await page.eval(moveTo('left', await page.eval(gripAt('front', 'left'))))
  await page.frames(3)
  await page.press('left', 'squeeze')
  await page.frames(3)
  await page.eval(moveTo('left', await page.eval(`(() => { const r = ${root}; const d = new THREE.Vector3(0, 0, -1).transformDirection(r.matrixWorld); return avatar.controllers.left.getWorldPosition(new THREE.Vector3()).addScaledVector(d, 0.2).add(new THREE.Vector3(-0.2, 0, 0.15)).toArray() })()`)))
  await page.frames(10)
  const where = `${root}.getWorldPosition(new THREE.Vector3())`
  const start = await page.eval(`${where}.toArray()`)
  await page.release('left', 'squeeze')
  await page.frames(1)
  await page.release('right', 'squeeze')
  await page.frames(30)
  console.log('both let go: held', await page.eval(`grab.heldIn('left')?.name ?? grab.heldIn('right')?.name ?? 'nothing'`), 'gun moved', await page.eval(`${where}.distanceTo(new THREE.Vector3(...${JSON.stringify(start)})).toFixed(3)`), 'm')
}
