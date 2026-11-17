// The open menu stays put when the head moves and turns (walking about the
// real room), and goes along when the rig moves (the sticks):
// node scripts/emulator.mjs tests/menu-stays.mjs (screenshot in /tmp/scen)
export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0.5])
  await page.eval(`menu.toggle()`)
  await page.frames(20)
  const where = () => page.eval(`(() => { const g = scene.getObjectByName('menu'); return g.position.toArray().map(v => v.toFixed(2)).join(' ') + ', turned ' + (g.rotation.y * 180 / Math.PI).toFixed(0) + ' deg' })()`)
  console.log('opened:', await where())
  await page.shot('/tmp/scen/menu-rows.png')
  await page.head([0.6, 1.5, 0.1], [0, 150, 0])
  await page.frames(30)
  console.log('head 60 cm away and turned 150 deg:', await where())
  await page.eval(`avatar.position.x += 1; avatar.position.z -= 0.5`)
  await page.frames(5)
  console.log('rig moved 1 m right, 0.5 m forward:', await where())
  await page.eval(`avatar.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI / 2)`)
  await page.frames(5)
  console.log('rig turned 90 deg:', await where(), '| rig at', await page.eval(`avatar.position.toArray().map(v => v.toFixed(2)).join(' ')`))
  console.log('errors:', page.logs.filter(l => /error|EXCEPTION/i.test(String(l))).slice(0, 5).join(' | ') || 'none')
}
