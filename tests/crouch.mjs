// The right stick past a threshold crouches or rises and stays until let go;
// a sideways push only turns: node scripts/emulator.mjs tests/crouch.mjs
export const query = ''
const height = page => page.eval(`camera.getWorldPosition(new THREE.Vector3()).y.toFixed(2)`)
const yaw = page => page.eval(`(avatar.rotation.y * 180 / Math.PI).toFixed(0)`)
const stick = (page, x, y) => page.eval(`xrDevice.controllers.right.updateAxes('thumbstick', ${x}, ${y})`)

export default async function (page) {
  await page.enterVR()
  await page.head([0, 1.6, 0])
  await page.until(`window.worldReady`)
  console.log('standing', await height(page))
  await stick(page, 0, 0.6); await page.frames(40)
  console.log('stick part of the way down', await height(page))
  await stick(page, 0, 1); await page.frames(60)
  console.log('down', await height(page))
  await stick(page, 0.5, 0.4); await page.frames(40)
  console.log('eased off but not let go', await height(page), 'turned', await yaw(page))
  await stick(page, 0, 0); await page.frames(60)
  console.log('let go', await height(page))
  await stick(page, 0, -1); await page.frames(60)
  console.log('up', await height(page))
  await stick(page, 0, 0); await page.frames(60)
  console.log('let go', await height(page))
  await stick(page, 1, 0.6); await page.frames(40)
  console.log('sideways with some down', await height(page), 'turned', await yaw(page))
  await stick(page, 0.2, 1); await page.frames(40)
  console.log('then down without letting go', await height(page))
  await stick(page, 0, 0); await page.frames(20)
}
