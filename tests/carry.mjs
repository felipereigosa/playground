// The menu and what is carried: a brick held when the menu opens brings the
// whole set into an icon in that hand; the open menu moves with the head
// but only comes round after a big turn; the blaster let go as an icon grows and waits in the air,
// and falls once it has been taken at full size and let go:
// node scripts/emulator.mjs tests/carry.mjs
export const query = 'gadget=lego&lego=new'

async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

// The right index fingertip on the watch, the left hand keeping what it holds
async function tapWatch (page) {
  await page.hand('left', [-0.05, 1.25, -0.25], [0, -60, -90])
  await page.hand('right', [0.2, 1.2, -0.2], [-30, 30, 0])
  await page.press('right', 'squeeze')
  await page.tipTo('right', await page.pointOn('touch', [0, 0.1, 0]))
  await page.tipTo('right', await page.pointOn('touch', [0, -0.003, 0]))
  await page.frames(8)
  await page.tipTo('right', await page.pointOn('touch', [0, 0.15, 0]))
  await page.frames(8)
  await page.release('right', 'squeeze')
  await page.hand('right', [0.25, 1.0, 0], [0, 0, 0])
  await page.frames(10)
}

const bricks = `scene.children.concat(avatar.controllers.left.children).filter(o => o.userData.gadget === 'lego' && !o.userData.icon).length`
const blaster = `(() => { let r; scene.traverse(o => { if (o.userData.gadget === 'blaster') r = o }); return r })()`
const menuAt = page => page.eval(`(() => { const m = scene.getObjectByName('menu'), h = camera.getWorldPosition(new THREE.Vector3())
  return 'open ' + menu.isOpen() + ', ' + Math.hypot(m.position.x - h.x, m.position.z - h.z).toFixed(2) + ' m from the head, turned ' + (m.rotation.y * 180 / Math.PI).toFixed(0) })()`)

export default async function (page) {
  await page.enterVR()
  await page.head([0, 1.6, 0], [-25, 0, 0])
  await page.until(`window.worldReady`)

  // A brick in the left hand, then the watch
  const brick = await page.eval(`scene.children.filter(o => o.userData.gadget === 'lego')[4].position.toArray()`)
  await handTo(page, 'left', brick)
  await page.press('left', 'squeeze')
  await page.frames(5)
  console.log('holding a brick:', await page.eval(`avatar.controllers.left.children.some(o => o.userData.gadget === 'lego')`), 'bricks', await page.eval(bricks))
  await tapWatch(page)
  await page.wait(600)
  await page.frames(3)
  console.log('menu opened: held', await page.eval(`grab.heldIn('left')?.name + (grab.heldIn('left')?.icon ? ' icon' : '')`), 'bricks', await page.eval(bricks))

  // Walking off with it
  console.log('menu', await menuAt(page))
  await page.head([0.15, 1.5, -0.1], [-40, 20, 0])
  await page.frames(30)
  console.log('after leaning', await menuAt(page))
  await page.head([2, 1.6, -1.5], [-25, -90, 0])
  await page.hand('left', [2.3, 1.2, -1.5])
  await page.frames(60)
  console.log('after walking 2.5 m and turning right', await menuAt(page))

  // The set put away there, the blaster taken out and let go
  const spot = n => page.eval(`scene.getObjectByName('menu').localToWorld(
    new THREE.Vector3(Math.sin(${n}) * 0.4, -0.22, -Math.cos(${n}) * 0.4)).toArray()`)
  await handTo(page, 'left', await spot(0.9))
  await page.frames(20)
  await page.release('left', 'squeeze')
  await page.wait(800)
  await page.frames(3)
  console.log('set put away: in the world', await page.eval(`scene.children.filter(o => o.userData.gadget === 'lego').length`))
  const copy = await page.eval(`scene.getObjectByName('menu').children.find(s => s.userData.name === 'blaster').children[0].getWorldPosition(new THREE.Vector3()).toArray()`)
  await handTo(page, 'right', copy)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === 'blaster'`)
  await page.hand('right', [2.5, 1.2, -1.2])
  await page.frames(5)
  await page.release('right', 'squeeze')
  await page.wait(2000)
  await page.frames(3)
  console.log('blaster let go as an icon: height', await page.eval(`${blaster}.position.y.toFixed(2) + ', scale ' + ${blaster}.scale.x.toFixed(2)`))
  const grip = await page.eval(`(() => { const r = ${blaster}; return r.getObjectByName('grip_back').getWorldPosition(new THREE.Vector3()).toArray() })()`)
  await handTo(page, 'right', grip)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === 'blaster'`)
  await page.frames(15)
  await page.release('right', 'squeeze')
  await page.wait(2000)
  await page.frames(3)
  console.log('taken at full size and let go: height', await page.eval(`${blaster}.position.y.toFixed(2)`))
  console.log('errors:', page.logs.filter(l => /error|EXCEPTION/i.test(String(l))).slice(0, 5).join(' | ') || 'none')
}
