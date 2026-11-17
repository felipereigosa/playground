// The blaster: summoned with ?gadget=blaster, picked up by the right hand,
// looked at from the head: node scripts/emulator.mjs tests/blaster.mjs
export const query = 'gadget=blaster'
const root = `(() => { let r; scene.traverse(o => { if (o.userData.gadget === 'blaster') r = o }); return r })()`
export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0.6], [-20, 0, 0])
  await page.until(`!!${root}`)
  const at = await page.eval(`${root}.getWorldPosition(new THREE.Vector3()).toArray()`)
  console.log('blaster at', at.map(v => v.toFixed(2)).join(' '))
  await page.shot('/tmp/scen/b0.png')
  await page.eval(`(() => { const p = xrDevice.controllers.right.position, g = hand.getPosition('right'), t = new THREE.Vector3(...${JSON.stringify(at)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === 'blaster'`)
  console.log('held by right:', await page.eval(`grab.heldIn('right')?.name`))
  await page.hand('right', [0.15, 1.3, 0.25])
  await page.frames(10)
  await page.shot('/tmp/scen/b1.png')
  await page.release('right', 'squeeze')
}
