// The radio: the red button switches it on (the strip glows, a station
// plays), the dial turned by a closed hand moves the needle, the black
// button seeks the next station and wraps, a fingertip rolls the volume
// wheel, the antenna follows a hand at its tip, and it is carried by its body:
// TIMEOUT=240000 node scripts/emulator.mjs tests/radio.mjs (screenshots in /tmp/scen)
export const query = 'gadget=radio'

const root = `(() => { let r; scene.traverse(o => { if (o.userData.gadget === 'radio') r = o }); return r })()`
const state = `${root}.userData.state`
const at = (page, local) => page.eval(`${root}.localToWorld(new THREE.Vector3(...${JSON.stringify(local)})).toArray()`)
const brief = page => page.eval(`(() => { const s = ${state}; return 'on ' + s.on + ', needle ' + s.t.toFixed(3) + ', volume ' + s.volume.toFixed(2) + ', antenna ' + (s.antennaAngle * 180 / Math.PI).toFixed(0) + ' deg out ' + s.antennaOut.toFixed(2) })()`)

async function handTo (page, side, target) {
  await page.eval(`(() => { const p = xrDevice.controllers['${side}'].position, g = hand.getPosition('${side}'), t = new THREE.Vector3(...${JSON.stringify(target)}); p.set(p.x + t.x - g.x, p.y + t.y - g.y, p.z + t.z - g.z) })()`)
  await page.frames(3)
}

// A pointing finger down onto a button and off it again
async function poke (page, name) {
  const [x, top, z] = await page.eval(`${state}.measures['${name}']`)
  await page.tipTo('right', await at(page, [x, top + 0.04, z]))
  await page.tipTo('right', await at(page, [x, top - 0.006, z]))
  await page.frames(6)
  await page.tipTo('right', await at(page, [x, top + 0.04, z]))
  await page.frames(6)
}

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.35, 0.45], [-20, 0, 0])
  await page.hand('left', [-0.5, 1.0, 0.3]); await page.hand('right', [0.5, 1.0, 0.3])
  await page.until(state)
  console.log('stations at', await page.eval(`${state}.measures.stations.length`), 'numbers; start:', await brief(page))
  await page.shot('/tmp/scen/radio0.png')

  await page.press('right', 'squeeze')          // pointing
  await poke(page, 'power')
  console.log('after the red button:', await brief(page), '| red button down by', await page.eval(`(${state}.buttons.power.depth * 1000).toFixed(1)`), 'mm')
  // Pushed far too deep and pulled back out through it: still one press
  {
    const [x, top, z] = await page.eval(`${state}.measures.power`)
    for (const y of [0.04, -0.006, -0.03, -0.06, -0.03, -0.006, 0.01, 0.04]) {
      await page.tipTo('right', await at(page, [x, top + y, z]))
      await page.frames(4)
      if (y === -0.06) console.log('finger 6 cm deep: on', await page.eval(`${state}.on`), '| button down by', await page.eval(`(${state}.buttons.power.depth * 1000).toFixed(1)`), 'mm')
    }
    console.log('after a deep press and back out: on', await page.eval(`${state}.on`), '(off: it counted once)')
    await poke(page, 'power')
    console.log('pressed again: on', await page.eval(`${state}.on`))
  }
  await page.wait(1500)
  await page.frames(3)
  console.log('glow', await page.eval(`${state}.glow.toFixed(2)`), '| playing:', await page.eval(`JSON.stringify(${state}.playing())`))
  await page.wait(1000)
  console.log('a second later:', await page.eval(`JSON.stringify(${state}.playing())`), '| audio context', await page.eval(`THREE.AudioContext.getContext().state`))
  await page.shot('/tmp/scen/radio1.png')

  await poke(page, 'seek')
  await page.wait(900); await page.frames(3)
  console.log('after seek:', await brief(page), '| on station', await page.eval(`${state}.locked`))
  const count = await page.eval(`${state}.playing.length, ${state}.measures.stations.length`)
  for (let i = 0; i < 5; i++) { await poke(page, 'seek'); await page.wait(1200); await page.frames(3) }
  console.log('after five more (six stations with the private one: wraps):', await brief(page), '| on station', await page.eval(`${state}.locked`))
  await page.release('right', 'squeeze')

  // The dial: a hand closed in front of it turns 40 degrees clockwise
  const knob = await page.eval(`${state}.knob.localToWorld(new THREE.Vector3(0, 0, 0.07)).toArray()`)
  await handTo(page, 'right', knob)
  await page.press('right', 'squeeze')
  console.log('dial taken by', await page.eval(`${state}.knobSide`), '| radio in the hand:', await page.eval(`!!grab.heldIn('right')`))
  for (const turn of [-10, -20, -30, -40]) {
    await page.eval(`(() => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ${turn} * Math.PI / 180)); xrDevice.controllers.right.quaternion.set(q.x, q.y, q.z, q.w) })()`)
    await page.frames(3)
  }
  console.log('after 40 deg clockwise:', await brief(page))
  await page.release('right', 'squeeze')
  await page.eval(`xrDevice.controllers.right.quaternion.set(0, 0, 0, 1)`)
  await page.shot('/tmp/scen/radio2.png')

  // The wheel: a fingertip up along its rim
  const [wx, wy, wz] = await page.eval(`${state}.measures.wheelAt`)
  const radius = await page.eval(`${state}.measures.wheelRadius`)
  const before = await page.eval(`${state}.volume`)
  for (let a = -50; a <= 50; a += 10) {
    const r = a * Math.PI / 180
    await page.tipTo('right', await at(page, [wx + (radius + 0.003) * Math.cos(r), wy + (radius + 0.003) * Math.sin(r), wz]))
  }
  console.log('volume', before.toFixed(2), '->', await page.eval(`${state}.volume.toFixed(2)`), 'after a stroke up')
  await page.hand('right', [0.5, 1.0, 0.3])

  // The antenna: taken by its tip, up and out
  const tip = await page.eval(`${state}.antenna[2].localToWorld(new THREE.Vector3(${state}.measures.tipReach, 0, 0)).toArray()`)
  const hinge = await page.eval(`${state}.antenna[0].getWorldPosition(new THREE.Vector3()).toArray()`)
  await handTo(page, 'left', tip)
  await page.press('left', 'squeeze')
  console.log('antenna taken by', await page.eval(`${state}.antennaHold?.side`))
  const tubes = () => page.eval(`'thin out ' + (${state}.thinOut * 1000).toFixed(0) + ' mm, medium out ' + (${state}.mediumOut * 1000).toFixed(0) + ' mm'`)
  for (const pulled of [0.03, 0.06, 0.2, 0.08, 0.03, -0.05]) {
    await handTo(page, 'left', [tip[0] + pulled, tip[1], tip[2]])
    console.log(`tip pulled ${pulled * 1000} mm along the antenna:`, await tubes())
  }
  await handTo(page, 'left', [hinge[0] + 0.15, hinge[1] + 0.15, hinge[2]])
  await handTo(page, 'left', [hinge[0], hinge[1] + 0.4, hinge[2]])
  await page.release('left', 'squeeze')
  await page.hand('left', [-0.5, 1.0, 0.3])
  console.log('antenna let go:', await brief(page))
  await page.shot('/tmp/scen/radio3.png')

  // Carried by its body
  const middle = await at(page, [-0.05, 0, -0.02])
  await handTo(page, 'right', middle)
  await page.press('right', 'squeeze')
  await page.frames(5)
  console.log('carried:', await page.eval(`grab.heldIn('right')?.name`))
  await handTo(page, 'right', [0.2, 1.0, -0.2])
  await page.release('right', 'squeeze')
  await page.hand('right', [0.5, 1.0, 0.3])
  await page.head([0.1, 1.3, 0.3], [-25, 15, 0])
  await page.frames(5)
  await page.shot('/tmp/scen/radio4.png')
  console.log('playing at the end:', await page.eval(`JSON.stringify(${state}.playing())`))
  console.log('errors:', page.logs.filter(l => /error|EXCEPTION/i.test(String(l))).slice(0, 5).join(' | ') || 'none')
}
