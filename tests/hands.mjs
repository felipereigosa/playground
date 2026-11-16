// The hand tracking demo (?hands) with emulated hands: a fist is seen as
// clenched, a pointing hand as pointing, and a fist inside the cube carries
// it. node scripts/emulator.mjs tests/hands.mjs (screenshots in /tmp/scen)
export const query = 'hands'

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0], [0, 0, 0])
  const set = (side, pose, position, euler = [0, 0, 0]) => page.eval(`(() => {
    xrDevice.primaryInputMode = 'hand'
    const h = xrDevice.hands['${side}']
    h.poseId = '${pose}'
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      ...${JSON.stringify(euler)}.map(THREE.MathUtils.degToRad), 'YXZ'))
    h.position.set(...${JSON.stringify(position)})
    h.quaternion.set(q.x, q.y, q.z, q.w)
  })()`)
  const state = () => page.eval(`handsDemo.hands.map(h => ({
    tracked: h.group.visible, clenched: h.clenched, pointing: h.pointing,
    holding: !!h.holding, m: handsDemo.measure(h)}))`)
  const cube = () => page.eval(`handsDemo.cube.position.toArray().map(x => +x.toFixed(3))`)

  console.log('poses', await page.eval(`xrDevice.hands.left.poseIds.join(' ')`))
  await set('left', 'default', [-0.25, 1.3, -0.3])
  await set('right', 'point', [0.2, 1.35, -0.3])
  await page.frames(5)
  console.log('relaxed left, point right', JSON.stringify(await state()))
  console.log('cube at', await cube())
  await page.shot('/tmp/scen/hands1.png')

  // Right fist, then move it so its centre lands in the cube
  await set('right', 'fist', [0.1, 1.4, -0.3])
  await page.frames(3)
  for (let i = 0; i < 3; i++) {
    await page.eval(`(() => {
      const h = handsDemo.hands.find(h => h.source.visible &&
        h.source.joints.wrist.getWorldPosition(new THREE.Vector3()).x > 0)
      const c = handsDemo.fistCentre(h)
      const d = handsDemo.cube.position.clone().sub(c)
      const p = xrDevice.hands.right.position
      p.x += d.x; p.y += d.y; p.z += d.z
    })()`)
    await page.frames(3)
  }
  // Open, move in, then clench, so the grab happens on the clench
  await set('right', 'default', await page.eval(`xrDevice.hands.right.position.toArray?.() ?? [xrDevice.hands.right.position.x, xrDevice.hands.right.position.y, xrDevice.hands.right.position.z]`))
  await page.frames(3)
  console.log('open in cube', JSON.stringify(await state()))
  await page.eval(`xrDevice.hands.right.poseId = 'fist'`)
  await page.frames(3)
  console.log('fist in cube', JSON.stringify(await state()))
  await page.shot('/tmp/scen/hands2.png')
  await page.eval(`xrDevice.hands.right.position.y += 0.2`)
  await page.frames(3)
  console.log('cube after lifting', await cube())
  await page.eval(`xrDevice.hands.right.poseId = 'default'`)
  await page.frames(3)
  await page.eval(`xrDevice.hands.right.position.y -= 0.2`)
  await page.frames(3)
  console.log('cube after letting go and moving down', await cube(), JSON.stringify(await state()))
  await page.shot('/tmp/scen/hands3.png')
}
