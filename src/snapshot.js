// A snapshot is the whole scene as it stands at one moment in the headset,
// hands and all, saved so that it can be opened on a flat screen, posed and
// framed with the mouse and saved as a picture. The video's thumbnail was
// made so: resources/thumbnail/README.md tells how, step by step.
//
// Taking one is off unless `localStorage.capture` is set in the headset's
// browser (node scripts/quest-eval.mjs 'localStorage.capture = 1', and
// 'delete localStorage.capture' to end it; it outlives reloads). While it is
// set either trigger takes a snapshot instead of doing what it does, and the
// controller buzzes twice. `node scripts/snapshot-pull.mjs <name>` then
// brings them from the headset to assets/snapshots/<name>1.json, ...
//
// Looking at one: https://localhost:8300/?snapshot=<name> on the laptop
// (node scripts/snapshot-open.mjs <name> opens it in the test Chromium). The
// view starts at the head's and is always 16:9.
//   left mouse turns the view, right moves it, the wheel comes nearer
//   [ and ] narrow and widen the lens, R goes back to the head's view
//   with Shift, on the hand or menu icon nearest the pointer:
//     left drag    turns a hand about its wrist, an icon about its stand
//     wheel        rolls a hand about the forearm, turns an icon
//     right drag   moves a hand across the picture
//     middle drag  moves a hand farther or nearer
//   P saves what is seen as a 1920 x 1080 png
// Nothing done to a snapshot is kept: a reload shows it as it was taken.
import * as THREE from 'three'
import * as util from './util.js'

const WIDTH = 1920
const HEIGHT = 1080

window.snapshots = window.snapshots || []

export function armed () {
  return !!window.captureArmed || !!localStorage.capture
}

export function take (side) {
  scene.updateMatrixWorld(true)
  // What metal and gloss mirror is made in the renderer and can't be saved:
  // it is left out and made again on opening
  const mirrors = []
  scene.traverse(child => {
    for (const material of [child.material].flat()) {
      if (material?.envMap) {
        mirrors.push([material, material.envMap])
        material.userData.mirror = material.metalness > 0.5 ? 'studio' : 'room'
        material.envMap = null
      }
    }
  })
  let text
  try {
    const head = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera
    text = JSON.stringify({head: head.matrixWorld.toArray(), scene: scene.toJSON()})
  }
  finally {
    for (const [material, envMap] of mirrors) {
      material.envMap = envMap
    }
  }
  window.snapshots.push(text)
  if (window.snapshots.length > 3) {
    window.snapshots.shift()
  }
  console.log(`snapshot ${window.snapshots.length}: ${(text.length / 1e6).toFixed(1)} MB`)
  util.pulse(side, 1, 80)
  setTimeout(() => util.pulse(side, 1, 80), 200)
}

// Shift and the mouse pose the hands and turn the menu's icons
function pose () {
  const canvas = renderer.domElement
  // A hand's wrist and a point up the forearm, in its controller's space
  const hands = ['left', 'right'].map(side => {
    const mirror = side === 'left' ? 1 : -1
    return {object: scene.getObjectByName(side + '_controller'),
            wrist: new THREE.Vector3(-0.052 * mirror, 0.06, 0.078),
            arm: new THREE.Vector3(-0.06 * mirror, 0.108, 0.113)}
  }).filter(hand => hand.object)
  const icons = (scene.getObjectByName('menu')?.children || [])
    .filter(slot => slot.children[0]?.children.length)
    .map(slot => ({object: slot.children[0], icon: true, wrist: new THREE.Vector3()}))

  const wristOf = thing => thing.object.localToWorld(thing.wrist.clone())
  const nearest = event => {
    const box = canvas.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width * 2 - 1
    const y = 1 - (event.clientY - box.top) / box.height * 2
    let best = null
    for (const thing of [...hands, ...icons]) {
      const at = wristOf(thing).project(camera)
      const distance = Math.hypot(at.x - x, (at.y - y) * HEIGHT / WIDTH)
      if (at.z < 1 && (!best || distance < best.distance)) {
        best = {...thing, distance}
      }
    }
    return best
  }
  const parentTurn = thing => thing.object.parent.getWorldQuaternion(new THREE.Quaternion())
  // A turn given in the world, the wrist staying where it is
  const turn = (thing, axis, angle) => {
    if (thing.icon) {
      thing.object.rotation.y += angle
      return
    }
    const object = thing.object
    object.updateMatrixWorld(true)
    const wrist = wristOf(thing)
    const parent = parentTurn(thing)
    const world = new THREE.Quaternion().setFromAxisAngle(axis, angle)
    object.quaternion.copy(parent.clone().invert().multiply(world).multiply(parent).multiply(object.quaternion))
    object.updateMatrixWorld(true)
    object.position.add(object.parent.worldToLocal(wrist).sub(object.parent.worldToLocal(wristOf(thing))))
    object.updateMatrixWorld(true)
  }
  const move = (thing, world) => {
    if (!thing.icon) {
      thing.object.position.add(world.applyQuaternion(parentTurn(thing).invert()))
      thing.object.updateMatrixWorld(true)
    }
  }
  const seen = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(camera.quaternion)

  let drag = null
  window.addEventListener('pointerdown', event => {
    if (event.shiftKey) {
      event.stopImmediatePropagation()
      event.preventDefault()
      drag = {thing: nearest(event), button: event.button, x: event.clientX, y: event.clientY}
    }
  }, true)
  window.addEventListener('pointermove', event => {
    if (!drag?.thing) return
    event.stopImmediatePropagation()
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY
    if (drag.button === 0) {
      turn(drag.thing, seen(0, 1, 0), dx * 0.006)
      if (!drag.thing.icon) {
        turn(drag.thing, seen(1, 0, 0), dy * 0.006)
      }
    }
    else if (drag.button === 2) {
      const far = camera.position.distanceTo(wristOf(drag.thing))
      const perPixel = 2 * far * Math.tan(util.toRadians(camera.fov) / 2) / canvas.getBoundingClientRect().height
      move(drag.thing, seen(dx * perPixel, -dy * perPixel, 0))
    }
    else {
      move(drag.thing, seen(0, 0, dy * 0.001))
    }
  }, true)
  window.addEventListener('pointerup', event => {
    if (drag) {
      event.stopImmediatePropagation()
      drag = null
    }
  }, true)
  window.addEventListener('wheel', event => {
    if (!event.shiftKey) return
    event.stopImmediatePropagation()
    event.preventDefault()
    const thing = nearest(event)
    if (thing) {
      // Shift turns the wheel sideways in some browsers
      const step = Math.sign(event.deltaY || event.deltaX) * 0.05
      const forearm = thing.icon ? null
        : wristOf(thing).sub(thing.object.localToWorld(thing.arm.clone())).normalize()
      turn(thing, forearm, step)
    }
  }, {capture: true, passive: false})
}

export async function view (name) {
  const saved = await (await fetch(`snapshots/${name || 'snapshot'}.json`)).json()
  const loaded = await new THREE.ObjectLoader().parseAsync(saved.scene)
  loaded.traverse(child => {
    for (const material of [child.material].flat()) {
      if (material?.userData.mirror === 'room') {
        material.envMap = util.reflections()
        material.needsUpdate = true
      }
    }
  })
  util.metal(loaded)
  window.scene = loaded

  // The picture's own size whatever the window's, shown as large as fits
  document.body.style.cssText = 'margin: 0; background: #222; overflow: hidden'
  document.head.appendChild(document.createElement('style')).textContent = '#VRButton { display: none !important }'
  const canvas = renderer.domElement
  renderer.setPixelRatio(1)
  renderer.setSize(WIDTH, HEIGHT, false)
  const fit = () => {
    const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT)
    canvas.style.cssText = `position: absolute; width: ${WIDTH * scale}px; height: ${HEIGHT * scale}px;` +
      `left: ${(window.innerWidth - WIDTH * scale) / 2}px; top: ${(window.innerHeight - HEIGHT * scale) / 2}px`
  }
  fit()
  window.addEventListener('resize', fit)

  camera.removeFromParent()
  camera.aspect = WIDTH / HEIGHT
  const headView = () => {
    const head = new THREE.Matrix4().fromArray(saved.head)
    head.decompose(camera.position, camera.quaternion, new THREE.Vector3())
    camera.fov = 60
    camera.updateProjectionMatrix()
    controls.target.copy(new THREE.Vector3(0, 0, -0.4).applyMatrix4(head))
    controls.update()
  }
  controls.mouseButtons = {LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN}
  controls.zoomSpeed = 0.5
  headView()

  renderer.setAnimationLoop(() => renderer.render(scene, camera))

  pose()

  // Before the game's own keys
  window.addEventListener('keydown', event => {
    event.stopImmediatePropagation()
    if (event.key === '[' || event.key === ']') {
      camera.fov = util.within(camera.fov + (event.key === '[' ? -2 : 2), 10, 110)
      camera.updateProjectionMatrix()
    }
    else if (event.key === 'r') {
      headView()
    }
    else if (event.key === 'p') {
      renderer.render(scene, camera)
      canvas.toBlob(blob => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = 'thumbnail.png'
        link.click()
      })
    }
  }, true)
  window.worldReady = true
}
