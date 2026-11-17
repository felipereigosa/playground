// Coming to rest: the table stands itself on the floor, the calculator let
// go over it comes down to lie on it with its top raised, away from it it
// stays in the air, and the blaster falls onto the table and, let go
// elsewhere, to the floor:
// node scripts/emulator.mjs tests/rest.mjs (screenshots in /tmp/scen)
export const query = 'gadget=table,calculator,blaster'

const root = name => `(() => { let r; scene.traverse(o => { if (o.userData.gadget === '${name}') r = o }); return r })()`
const where = (page, name) => page.eval(`(() => { const r = ${root(name)}; const p = r.getWorldPosition(new THREE.Vector3())
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(r.getWorldQuaternion(new THREE.Quaternion()))
  return p.toArray().map(v => v.toFixed(2)).join(' ') + ', its y axis ' + (Math.acos(up.y) * 180 / Math.PI).toFixed(0) + ' deg from up, in ' + (r.parent === scene ? 'the scene' : r.parent.name) })()`)

async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

// Takes a gadget by its collision mesh (or a grip) and carries it to a point
async function carry (page, name, to, grip) {
  const at = await page.eval(`(() => { const r = ${root(name)}
    const c = ${grip ? `r.getObjectByName('${grip}')` : `r.children.find(c => c.name.startsWith('collision'))`}
    return c.getWorldPosition(new THREE.Vector3()).toArray() })()`)
  await handTo(page, 'right', at)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === '${name}'`)
  await page.frames(15)
  await handTo(page, 'right', to)
  await page.frames(5)
  await page.release('right', 'squeeze')
  await page.hand('right', [0.5, 1.0, 0.3])
}

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.7, 0.5], [-30, 0, 0])
  await page.until(`window.worldReady`)

  await carry(page, 'table', [0.1, 1.2, -0.7])
  await page.wait(1200)
  await page.frames(3)
  console.log('table:', await where(page, 'table'))

  await carry(page, 'calculator', [-0.1, 1.25, -0.6])
  await page.wait(1200)
  await page.frames(3)
  console.log('calculator over the table:', await where(page, 'calculator'))

  await carry(page, 'blaster', [0.15, 1.3, -0.6], 'grip_back')
  await page.wait(2500)
  await page.frames(3)
  console.log('blaster over the table:', await where(page, 'blaster'))
  await page.shot('/tmp/scen/r1.png')

  await carry(page, 'calculator', [-0.8, 1.3, -0.3])
  await page.wait(1000)
  await page.frames(3)
  console.log('calculator away from it:', await where(page, 'calculator'))

  await carry(page, 'blaster', [0.9, 1.3, -0.2], 'grip_back')
  await page.wait(2500)
  await page.frames(3)
  console.log('blaster away from it:', await where(page, 'blaster'))
  await page.head([0, 1.7, 0.9], [-35, 0, 0])
  await page.frames(5)
  await page.shot('/tmp/scen/r2.png')
  console.log('errors:', page.logs.filter(l => /error|EXCEPTION/i.test(String(l))).slice(0, 5).join(' | ') || 'none')
}
