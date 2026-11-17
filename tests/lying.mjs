// Lying down: entering VR on the back, looking at the ceiling, the world is
// turned so the top of the head is up, the head sits 1.1 m above the floor,
// which stays, and the blaster let go falls to it:
// node scripts/emulator.mjs tests/lying.mjs
export const query = 'gadget=blaster'

export default async function (page) {
  await page.enterVR()
  await page.head([0.3, 0.4, 0.2], [85, 0, 0])
  await page.frames(45)
  await page.until(`window.worldReady`)
  console.log(await page.eval(`(() => {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
    const head = camera.getWorldPosition(new THREE.Vector3())
    return 'head up is ' + up.toArray().map(v => v.toFixed(2)).join(' ') + ', head at height ' + head.y.toFixed(2) +
      ', floor shown ' + scene.getObjectByName('ground').visible + ', grid shown ' + scene.getObjectByName('grid').visible
  })()`))
  const blaster = `scene.children.find(o => o.userData.gadget === 'blaster') ?? grab.heldIn('right').root`
  const grip = await page.eval(`(() => { const r = ${blaster}; return r.getObjectByName('grip_back').getWorldPosition(new THREE.Vector3()).toArray() })()`)
  await page.eval(`(() => { const p = xrDevice.controllers.right.position, g = hand.getPosition('right'), t = new THREE.Vector3(...${JSON.stringify(grip)}); const d = t.sub(g).applyQuaternion(avatar.quaternion.clone().invert()); p.set(p.x + d.x, p.y + d.y, p.z + d.z) })()`)
  await page.frames(3)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === 'blaster'`)
  await page.frames(15)
  await page.release('right', 'squeeze')
  await page.wait(2000)
  await page.frames(3)
  console.log('blaster let go: height', await page.eval(`(${blaster}).position.y.toFixed(2)`))
}
