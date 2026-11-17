// Sets (targets, Lego): deployed with ?gadget=, a blaster bolt strikes a
// target and knocks a brick; with the menu open a hand on one target gathers
// them all into an icon, which deploys again where it is let go and is put
// away on the arc; the bricks gather and deploy the same way, and one is
// picked up and dropped:
// node scripts/emulator.mjs tests/sets.mjs (screenshots in /tmp/scen)
export const query = 'gadget=targets,blaster,lego&lego=new'

const parts = name => `scene.children.filter(o => o.userData.gadget === '${name}' && (o.name === 'target' ? o.userData.hits !== undefined : !o.userData.icon))`
const count = (page, name) => page.eval(`${parts(name)}.length`)
const blaster = `scene.children.find(o => o.userData.gadget === 'blaster')`

async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

const positionOf = (page, name, i) => page.eval(
  `${parts(name)}[${i}].getWorldPosition(new THREE.Vector3()).toArray()`)

// A point 2 m out of the muzzle
const ahead = `(() => {
  const muzzle = scene.getObjectByName('muzzle')
  const from = muzzle.getWorldPosition(new THREE.Vector3())
  const direction = new THREE.Vector3(0, 0, -1).transformDirection(muzzle.parent.matrixWorld)
  return from.addScaledVector(direction, 2)
})()`

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0.6], [-10, 0, 0])
  await page.until(`window.worldReady`)
  console.log('deployed: targets', await count(page, 'targets'), 'bricks', await count(page, 'lego'))
  await page.frames(5)
  await page.shot('/tmp/scen/s1.png')

  // The blaster by its back grip, a target put in front of the muzzle
  const grip = await page.eval(`(() => { const r = ${blaster}; return r.localToWorld(r.getObjectByName('grip_back').position.clone()).toArray() })()`)
  await handTo(page, 'right', grip)
  await page.press('right', 'squeeze')
  await page.until(`grab.heldIn('right')?.name === 'blaster'`)
  await page.frames(20)
  await page.eval(`(() => { const t = ${parts('targets')}[0]; t.position.copy(${ahead}); t.lookAt(scene.getObjectByName('muzzle').getWorldPosition(new THREE.Vector3())); t.updateMatrixWorld(true) })()`)
  await page.press('right', 'trigger')
  await page.wait(900)
  await page.frames(2)
  await page.release('right', 'trigger')
  console.log('shots', await page.eval(`grab.heldIn('right').root.userData.shots`), 'target struck', await page.eval(`${parts('targets')}[0].userData.hits`), 'times, last on',
    await page.eval(`(() => { const t = ${parts('targets')}[0]; return t.userData.ring + ', rings apart ' + t.getObjectByName('centre').position.z.toFixed(3) })()`))
  await page.shot('/tmp/scen/s2.png')

  // A brick there instead
  await page.eval(`(() => { ${parts('targets')}[0].position.set(3, 1, 3); const g = ${parts('lego')}[0]; const p = ${ahead}; g.body.position.set(p.x, p.y, p.z); g.position.copy(p); g.updateMatrixWorld(true) })()`)
  await page.frames(2)
  await page.press('right', 'trigger')
  await page.wait(700)
  await page.frames(2)
  await page.release('right', 'trigger')
  console.log('brick knocked: speed', await page.eval(`${parts('lego')}[0].body.velocity.length().toFixed(2)`))
  await page.release('right', 'squeeze')
  await page.frames(5)

  // Menu open, a hand on a target: all of them into an icon in that hand
  await page.eval(`menu.toggle()`)
  await page.frames(10)
  await handTo(page, 'left', await positionOf(page, 'targets', 2))
  await page.press('left', 'squeeze')
  await page.frames(4)
  await page.shot('/tmp/scen/s3.png')
  await page.wait(700)
  await page.frames(3)
  console.log('gathered: held', await page.eval(`grab.heldIn('left')?.name`), 'targets left', await count(page, 'targets'))

  // Let go away from the arc: they deploy around that spot
  await page.hand('left', [-0.6, 1.3, -0.2])
  await page.frames(5)
  await page.release('left', 'squeeze')
  await page.wait(900)
  await page.frames(3)
  console.log('let go away: menu open', await page.eval(`menu.isOpen()`), 'targets', await count(page, 'targets'),
    'first at', (await positionOf(page, 'targets', 0)).map(v => v.toFixed(2)).join(' '))
  await page.shot('/tmp/scen/s4.png')

  console.log('farthest target from the middle', await page.eval(`Math.max(...${parts('targets')}.map(t => Math.max(Math.abs(t.position.x), Math.abs(t.position.z)))).toFixed(2)`))

  // Gathered again and let go in the arc's empty spot: put away
  await page.eval(`menu.toggle()`)
  await page.frames(10)
  await handTo(page, 'left', await positionOf(page, 'targets', 0))
  await page.press('left', 'squeeze')
  await page.wait(600)
  const end = await page.eval(`scene.getObjectByName('menu').localToWorld(
    new THREE.Vector3(Math.sin(0.45) * 0.4, -0.22, -Math.cos(0.45) * 0.4)).toArray()`)
  await handTo(page, 'left', end)
  await page.frames(20)
  await page.shot('/tmp/scen/s5.png')
  await page.release('left', 'squeeze')
  await page.wait(900)
  await page.frames(3)
  console.log('put away: targets in the world', await page.eval(`scene.children.filter(o => o.userData.gadget === 'targets').length`),
    'on the arc', await page.eval(`scene.getObjectByName('menu').children.some(slot => slot.userData.name === 'targets' && slot.scale.x > 0.5)`))

  // Bricks: gathered by one of them, then let go elsewhere
  const before = await count(page, 'lego')
  await handTo(page, 'left', await positionOf(page, 'lego', 3))
  await page.press('left', 'squeeze')
  await page.wait(700)
  await page.frames(3)
  console.log('bricks gathered: held', await page.eval(`grab.heldIn('left')?.name`), 'left', await count(page, 'lego'), 'of', before)
  await page.head([4.5, 1.6, 0.6], [-10, -90, 0])
  await page.hand('left', [5, 1.2, 0])
  await page.frames(5)
  await page.release('left', 'squeeze')
  await page.wait(900)
  await page.frames(3)
  console.log('bricks deployed again:', await count(page, 'lego'))
  console.log('farthest brick from the middle', await page.eval(`Math.max(...${parts('lego')}.map(t => Math.max(Math.abs(t.position.x), Math.abs(t.position.z)))).toFixed(2)`))
  await page.head([0, 1.7, 1.5], [-30, 0, 0])
  await page.frames(5)
  await page.shot('/tmp/scen/s6.png')

  // One picked up, lifted and dropped
  await page.eval(`window.brick = ${parts('lego')}[5]`)
  await handTo(page, 'right', await positionOf(page, 'lego', 5))
  await page.press('right', 'squeeze')
  await page.frames(5)
  console.log('brick in', await page.eval(`brick.parent.name || 'the scene'`))
  await page.hand('right', [0.3, 1.2, -0.3])
  await page.frames(5)
  await page.release('right', 'squeeze')
  await page.wait(1500)
  await page.frames(3)
  console.log('dropped: height', await page.eval(`brick.position.y.toFixed(2) + ' in ' + (brick.parent === scene ? 'the scene' : brick.parent.name)`))
  // A brick held with a hole on another one's peg, let go: they join; the
  // build comes back after gathering and deploying
  const groups = `scene.children.concat(avatar.controllers.right.children).filter(o => o.userData.gadget === 'lego' && !o.userData.icon)`
  const kids = (g, kind) => `${g}.children[0].children.find(c => c.name.startsWith('${kind}_1_'))`
  await page.eval(`(() => {
    const all = ${groups}
    window.a = all.find(g => ${kids('g', 'peg')})
    window.b = all.find(g => g !== a && ${kids('g', 'hole')})
  })()`)
  await handTo(page, 'right', await page.eval(`b.getWorldPosition(new THREE.Vector3()).toArray()`))
  await page.press('right', 'squeeze')
  await page.frames(5)
  await page.hand('right', [0.3, 1.2, -0.3])
  await page.frames(3)
  await page.eval(`(() => {
    scene.updateMatrixWorld(true)
    const peg = ${kids('a', 'peg')}, hole = ${kids('b', 'hole')}
    const x = o => new THREE.Vector3(1, 0, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()))
    a.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(x(peg), x(hole)))
    a.updateMatrixWorld(true)
    a.position.add(hole.getWorldPosition(new THREE.Vector3()).sub(peg.getWorldPosition(new THREE.Vector3())))
    a.body.position.copy(a.position)
    a.body.quaternion.copy(a.quaternion)
  })()`)
  await page.frames(3)
  const n = await page.eval(`${groups}.length`)
  await page.release('right', 'squeeze')
  await page.frames(5)
  console.log('joined: groups', n, 'to', await page.eval(`${groups}.length`), 'bricks in it', await page.eval(`a.children.length`))
  await page.eval(`menu.toggle()`)
  await page.frames(5)
  await handTo(page, 'left', await page.eval(`a.getWorldPosition(new THREE.Vector3()).toArray()`))
  await page.press('left', 'squeeze')
  await page.wait(700)
  await page.hand('left', [-0.5, 1.2, -0.5])
  await page.frames(5)
  await page.release('left', 'squeeze')
  await page.wait(900)
  await page.frames(3)
  console.log('after gathering and deploying: groups', await page.eval(`${groups}.length`), 'largest has',
    await page.eval(`Math.max(...${groups}.map(g => g.children.length))`), 'bricks; saved',
    await page.eval(`JSON.parse(localStorage.getItem('playground.lego')).length`))
  await page.head([0, 1.2, 0.3], [-30, 30, 0])
  await page.frames(5)
  await page.shot('/tmp/scen/s7.png')
  console.log('errors:', page.logs?.filter?.(l => /error/i.test(String(l))).slice(0, 5).join(' | ') || 'none')
}
