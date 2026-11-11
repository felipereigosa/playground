// Watch, menu, summoning, dropping and putting away, in the emulated headset:
// node scripts/emulator.mjs tests/summon.mjs (screenshots in /tmp/scen)
export const query = ''

const info = page => page.eval(`(() => {
  let real = null; scene.traverse(o => { if (o.userData.gadget) real = o })
  return {open: menu.isOpen(), held: grab.heldIn('right')?.name || null,
    real: real && {name: real.userData.gadget, scale: +real.scale.x.toFixed(3), parent: real.parent.name || real.parent.type}}
})()`)

// Puts a controller's grip (where grabs happen) at a world position
async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

// Raises the left wrist, touches the watch with the right index fingertip,
// and puts both hands back down
async function tapWatch (page) {
  await page.hand('left', [-0.05, 1.25, -0.25], [0, -60, -90])
  await page.hand('right', [0.2, 1.2, -0.2], [-30, 30, 0])
  await page.tipTo('right', await page.pointOn('touch', [0, 0.1, 0]))
  await page.tipTo('right', await page.pointOn('touch', [0, 0.01, 0]))
  await page.frames(3)
  await page.tipTo('right', await page.pointOn('touch', [0, 0.15, 0]))
  await page.hand('left', [-0.3, 0.9, 0], [0, 0, 0])
  await page.hand('right', [0.25, 1.0, 0], [0, 0, 0])
  await page.frames(15)
}

// Passing 6 cm from the watch must not open the menu
async function passNearWatch (page) {
  await page.hand('left', [-0.05, 1.25, -0.25], [0, -60, -90])
  await page.hand('right', [0.2, 1.2, -0.2], [-30, 30, 0])
  await page.tipTo('right', await page.pointOn('touch', [0, 0.06, 0]))
  await page.frames(5)
  await page.hand('right', [0.25, 1.0, 0], [0, 0, 0])
  await page.hand('left', [-0.3, 0.9, 0], [0, 0, 0])
}

// World position of a menu copy (slot -> pivot)
const copy = (page, i) => page.eval(
  `scene.getObjectByName('menu').children[${i}].children[0].getWorldPosition(new THREE.Vector3()).toArray()`)

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0], [-25, 0, 0])
  await passNearWatch(page)
  console.log('after passing near (closed)', JSON.stringify(await info(page)))
  await tapWatch(page)
  console.log('after tap', JSON.stringify(await info(page)))
  await page.wait(1500)
  await page.shot('/tmp/scen/f1.png')

  await handTo(page, 'right', await copy(page, 0))
  await page.press('right', 'squeeze')
  await page.frames(4)
  await page.shot('/tmp/scen/f2.png')
  await page.wait(600)
  console.log('after summon (menu closed)', JSON.stringify(await info(page)))
  await page.hand('right', [0.12, 1.35, -0.35], [-20, 0, 0])
  await page.shot('/tmp/scen/f3.png')

  await page.hand('right', [0.4, 1.35, -0.35], [0, 0, 0])
  await page.release('right', 'squeeze')
  await page.wait(300)
  console.log('after drop', JSON.stringify(await info(page)))

  // reopen the menu, pick the calculator up again, let go on the menu
  await tapWatch(page)
  const pos = await page.eval(`(() => { let r; scene.traverse(o => { if (o.userData.gadget) r = o }); return r.getWorldPosition(new THREE.Vector3()).toArray() })()`)
  await handTo(page, 'right', pos)
  await page.press('right', 'squeeze')
  console.log('regrab', JSON.stringify(await info(page)))
  await handTo(page, 'right', await copy(page, 1))
  await page.release('right', 'squeeze')
  await page.frames(4)
  await page.shot('/tmp/scen/f4.png')
  await page.wait(800)
  console.log('after put away', JSON.stringify(await info(page)))
}
