import * as THREE from 'three'
import * as player from './player.js'
import * as util from './util.js'
import * as hand from './hand.js'
import * as grab from './grab.js'
import * as watch from './watch.js'
import * as menu from './menu.js'
import * as physics from './physics.js'
import { gadgets, find } from './gadgets.js'

// The gadgets in the world, one of each at most, by name: {name, module, root}
const instances = new Map()

// Running animations: functions of the time since they started (seconds)
// that return true when done
const animations = []

function animate (step) {
  animations.push({start: performance.now(), step})
}

function runAnimations () {
  const now = performance.now()
  for (const animation of [...animations]) {
    if (animation.step((now - animation.start) / 1000)) {
      animations.splice(animations.indexOf(animation), 1)
    }
  }
}

const smooth = t => t * t * (3 - 2 * t)

// ?gadget=calculator,cube puts gadgets in front of you on loading, for testing
export async function init () {
  player.init()
  await watch.create()
  await menu.create()

  const names = (new URLSearchParams(location.search).get('gadget') || '')
    .split(',').filter(name => find(name))
  const row = []
  for (const name of names) {
    const gadget = await spawn(name)
    if (isSet(gadget)) {
      gadget.module.deploy(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0, 0, -1))
      gadget.root.removeFromParent()
    }
    else {
      row.push(gadget)
    }
  }
  placeInRow(row)
  console.log(`world init: ${names.join(', ') || 'no gadgets'}`)
  window.worldReady = true
}

// Side by side in front of the start position, 10 cm apart
function placeInRow (row) {
  const widths = row.map(gadget =>
    new THREE.Box3().setFromObject(gadget.root).getSize(new THREE.Vector3()).x)
  let x = -(widths.reduce((a, b) => a + b, 0) + 0.1 * (row.length - 1)) / 2
  for (const [i, gadget] of row.entries()) {
    const box = new THREE.Box3().setFromObject(gadget.root)
    const offset = gadget.root.position.x - box.getCenter(new THREE.Vector3()).x
    gadget.root.position.set(x + widths[i] / 2 + offset, 0.9, -0.1)
    x += widths[i] + 0.1
  }
}

async function spawn (name) {
  if (instances.has(name)) {
    return instances.get(name)
  }
  const module = await find(name).load()
  const root = await module.create()
  root.userData.gadget = name
  const gadget = {name, module, root, scale: root.scale.x}
  instances.set(name, gadget)
  menu.setOut(name, true)
  scene.add(root)
  return gadget
}

function despawn (gadget) {
  grab.forget(gadget)
  if (gadget.body) {
    physics.world.removeBody(gadget.body)
  }
  gadget.root.removeFromParent()
  gadget.module.dispose?.()
  instances.delete(gadget.name)
  menu.setOut(gadget.name, false)
}

function gadgetOf (object) {
  for (; object; object = object.parent) {
    const name = object.userData.gadget
    if (name) {
      return instances.get(name)
    }
  }
  return null
}

// Coming to rest. A gadget let go at its full size falls (module.falls),
// stands itself on the floor (module.stands), or stays in the air where it
// is, unless that is over a surface, which it comes down to rest on.
const THROW_WINDOW = 0.1    // seconds of hand movement a throw's speed comes from
const trail = {left: [], right: []}   // each hand's {time, position} lately

function recordHands () {
  const now = performance.now() / 1000
  for (const side of ['left', 'right']) {
    trail[side].push({time: now, position: hand.getPosition(side)})
    while (trail[side].length > 2 && now - trail[side][0].time > THROW_WINDOW) {
      trail[side].shift()
    }
  }
}

function handVelocity (side) {
  const [first, last] = [trail[side][0], trail[side].at(-1)]
  return first && last.time > first.time
    ? last.position.clone().sub(first.position).divideScalar(last.time - first.time)
    : new THREE.Vector3()
}

function cameToRest (gadget, side) {
  if (isSet(gadget) || gadget.root.parent !== scene) {
    return
  }
  const module = gadget.module
  if (module.falls) {
    gadget.body = physics.hull(gadget.root)
    const velocity = side ? handVelocity(side) : new THREE.Vector3()
    gadget.body.velocity.set(velocity.x, velocity.y, velocity.z)
    return
  }
  const surface = module.stands ? 0 : physics.surfaceBelow(gadget.root.position)
  if (surface !== null && gadget.root.position.y > surface - 0.05) {
    settle(gadget, surface, module.stands ? {up: [0, 1, 0]} : module.rest)
  }
}

// The gadget's turn at rest: `up` (or else whichever of its axes is nearest
// to it now) turned upwards by the smallest turn, then the end along `top`
// raised by `tilt` degrees
function restTurn (root, rest = {}) {
  const worldUp = new THREE.Vector3(0, 1, 0)
  let up = rest.up && new THREE.Vector3(...rest.up)
  if (!up) {
    for (const axis of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const candidate = new THREE.Vector3(...axis)
      const height = candidate.clone().applyQuaternion(root.quaternion).y
      if (!up || height > up.clone().applyQuaternion(root.quaternion).y) {
        up = candidate
      }
    }
  }
  const turn = new THREE.Quaternion().setFromUnitVectors(
    up.clone().applyQuaternion(root.quaternion), worldUp).multiply(root.quaternion)
  if (rest.tilt) {
    const top = new THREE.Vector3(...rest.top).applyQuaternion(turn)
    turn.premultiply(new THREE.Quaternion().setFromAxisAngle(
      top.clone().cross(worldUp).normalize(), THREE.MathUtils.degToRad(rest.tilt)))
  }
  return turn
}

// Down onto a surface at height y, as fast as it would fall, turning to how
// it rests; a hand that takes it meanwhile ends that
function settle (gadget, y, rest) {
  const root = gadget.root
  const from = {position: root.position.clone(), quaternion: root.quaternion.clone()}
  const to = restTurn(root, rest)
  root.quaternion.copy(to)
  root.updateMatrixWorld(true)
  const lowest = new THREE.Box3().setFromObject(root).min.y
  root.quaternion.copy(from.quaternion)
  const drop = Math.max(lowest - y, 0)
  const rise = Math.max(y - lowest, 0)   // let go partly below it
  const seconds = Math.max(Math.sqrt(2 * drop / 9.82), 0.2)
  animate(t => {
    if (root.parent !== scene || gadget.icon || gadget.leaving) {
      return true
    }
    const k = Math.min(t / seconds, 1)
    root.position.y = from.position.y - drop * k * k + rise * smooth(k)
    root.quaternion.slerpQuaternions(from.quaternion, to, smooth(k))
    return k === 1
  })
}

// Every frame: gadgets that fell follow their bodies, until taken again;
// one that got out of the room comes back in at the wall
function updateBodies () {
  for (const gadget of instances.values()) {
    const body = gadget.body
    if (!body) {
      continue
    }
    if (gadget.root.parent !== scene || gadget.icon || gadget.leaving) {
      physics.world.removeBody(body)
      gadget.body = null
      continue
    }
    const inside = physics.ROOM - 0.5
    if (body.position.y < -1 || Math.abs(body.position.x) > physics.ROOM ||
        Math.abs(body.position.z) > physics.ROOM) {
      body.position.set(THREE.MathUtils.clamp(body.position.x, -inside, inside), 1,
        THREE.MathUtils.clamp(body.position.z, -inside, inside))
      body.velocity.set(0, 0, 0)
      body.angularVelocity.set(0, 0, 0)
    }
    gadget.root.position.copy(body.position)
    gadget.root.quaternion.copy(body.quaternion)
  }
}

// Sets. A gadget whose module has deploy() is a set of loose parts (targets,
// bricks) with no body of its own: its root is only ever an icon. Letting the
// icon go away from the menu deploys the set there, the parts flying out of
// the icon to their places; with the menu open, closing a hand on any part
// gathers them all into an icon in that hand.
const isSet = gadget => !!gadget.module.deploy

// The level direction the head looks in
function facing () {
  const forward = camera.getWorldDirection(new THREE.Vector3())
  forward.y = 0
  return forward.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, -1) : forward.normalize()
}

// The set's parts with where they are now (world) and their size
function partsOf (gadget) {
  scene.updateMatrixWorld(true)
  return gadget.module.parts().map(object => ({
    object,
    position: object.position.clone(),
    world: object.getWorldPosition(new THREE.Vector3()),
    scale: object.scale.clone(),
  }))
}

// Puts a part at a point (world), at a fraction of its size
function placePart (part, point, k) {
  part.object.position.copy(part.object.parent.worldToLocal(point.clone()))
  part.object.scale.copy(part.scale).multiplyScalar(Math.max(k, 0.001))
}

// The icon, let go at this position, bursts into its parts
function deploy (gadget, position) {
  const root = gadget.root
  const iconScale = root.scale.x
  gadget.module.deploy(position.clone(), facing())
  gadget.growing = true
  const parts = partsOf(gadget)
  const point = new THREE.Vector3()
  animate(t => {
    const k = smooth(Math.min(t / 0.45, 1))
    for (const part of parts) {
      placePart(part, point.lerpVectors(position, part.world, k), k)
    }
    root.scale.setScalar(Math.max(iconScale * (1 - k), 0.0001))
    if (k === 1) {
      root.removeFromParent()
      gadget.icon = false
      gadget.growing = false
      return true
    }
  })
}

// A hand closed on a part with the menu open: the set's icon appears in the
// hand and every part flies into it. gadget.finishGather ends that at once,
// for an icon let go before they are all in.
function gather (side, gadget) {
  const root = gadget.root
  gadget.icon = true
  root.position.copy(hand.getPosition(side))
  root.quaternion.identity()
  root.scale.setScalar(menu.iconScale(gadget.name))
  scene.add(root)
  grab.forget(gadget)
  grab.take(side, gadget)
  const parts = partsOf(gadget)
  let done = false
  // The parts go back to how they were just before being stowed, for a set
  // that remembers its layout
  gadget.finishGather = () => {
    if (!done) {
      done = true
      gadget.finishGather = null
      for (const part of parts) {
        part.object.position.copy(part.position)
        part.object.scale.copy(part.scale)
      }
      gadget.module.stow()
    }
  }
  const point = new THREE.Vector3()
  animate(t => {
    if (done) {
      return true
    }
    const k = smooth(Math.min(t / 0.35, 1))
    const target = root.getWorldPosition(new THREE.Vector3())
    for (const part of parts) {
      placePart(part, point.lerpVectors(part.world, target, k), 1 - k)
    }
    if (k === 1) {
      gadget.finishGather()
      return true
    }
  })
}

// Icons. With the menu open, gadgets are handled at the size of its copies:
// closing a hand on a copy takes the gadget out as an icon (the gadget
// itself, made now and shrunk to the copy's size), and grabbing a gadget in
// the world shrinks it to one. An icon's own behaviour is paused. Letting an
// icon go in the menu's empty spot puts it away there; anywhere else closes
// the menu, and the gadget grows to full size where it was let go.

// Changes a gadget's size over a moment, keeping the point at `anchor` (in
// the space of its parent when this starts) where it is, even if the gadget
// changes hands or is let go meanwhile
function resize (gadget, toScale, anchor, seconds, done) {
  const root = gadget.root
  const parent = root.parent
  const fromScale = root.scale.x
  const held = anchor.clone().sub(root.position)
    .applyQuaternion(root.quaternion.clone().invert()).divideScalar(fromScale)
  animate(t => {
    if (gadget.leaving) {
      return true
    }
    const k = smooth(Math.min(t / seconds, 1))
    const scale = THREE.MathUtils.lerp(fromScale, toScale, k)
    root.scale.setScalar(scale)
    const point = parent.localToWorld(anchor.clone())
    const world = point.sub(held.clone().multiplyScalar(scale)
      .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())))
    root.position.copy(root.parent.worldToLocal(world))
    if (k === 1) {
      done?.()
      return true
    }
  })
}

// While a hand's icon is being made: a token, cleared if the hand lets go
// meanwhile, in which case the icon is let go as soon as it exists
const taking = {left: null, right: null}

async function takeIcon (side, slot) {
  const token = {}
  taking[side] = token
  slot.mini.updateMatrixWorld(true)
  const copy = slot.mini.matrixWorld.clone()
  menu.setOut(slot.name, true)
  const gadget = await spawn(slot.name)
  gadget.icon = true
  copy.decompose(gadget.root.position, gadget.root.quaternion, gadget.root.scale)
  if (taking[side] === token) {
    taking[side] = null
    grab.take(side, gadget)
  }
  else {
    letGoIcon(gadget, hand.getPosition(side))
  }
}

// A gadget grabbed in the world while the menu is open shrinks into an icon
function shrinkToIcon (side, gadget) {
  gadget.icon = true
  resize(gadget, menu.iconScale(gadget.name), new THREE.Vector3(), 0.25)
}

// An icon let go (already out of the hand) at this position
function letGoIcon (gadget, position) {
  gadget.finishGather?.()
  const slot = menu.slotForPutAway(gadget.name, position)
  if (slot) {
    putAway(gadget, slot)
    return
  }
  menu.close()
  if (isSet(gadget)) {
    deploy(gadget, position)
    return
  }
  gadget.growing = true
  resize(gadget, gadget.scale, position, 0.35, () => {
    gadget.icon = false
    gadget.growing = false
    // One that falls waits in the air until it has been taken at full
    // size, not to have to be picked up from the floor first
    if (!gadget.module.falls) {
      cameToRest(gadget)
    }
  })
}

// Into the menu's empty spot: it turns and shrinks from how it was held onto
// its copy there (hidden and still until then), and goes
function putAway (gadget, slot) {
  gadget.leaving = true
  menu.setOut(gadget.name, false)
  menu.arriving(gadget.name, true, gadget.root.getWorldQuaternion(new THREE.Quaternion()))
  grab.forget(gadget)
  const root = gadget.root
  const from = {
    position: root.position.clone(),
    quaternion: root.quaternion.clone(),
    scale: root.scale.x,
  }
  animate(t => {
    const k = smooth(Math.min(t / 0.25, 1))
    slot.mini.updateMatrixWorld(true)
    const to = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    }
    slot.mini.matrixWorld.decompose(to.position, to.quaternion, to.scale)
    root.position.lerpVectors(from.position, to.position, k)
    root.quaternion.slerpQuaternions(from.quaternion, to.quaternion, k)
    root.scale.setScalar(THREE.MathUtils.lerp(from.scale, to.scale.x, k))
    if (k === 1) {
      despawn(gadget)
      menu.arriving(gadget.name, false)
      return true
    }
  })
}

export function buttonPressed (side, button) {
  if (button === 'grab') {
    const position = hand.getPosition(side)
    const slot = menu.slotAt(position)
    if (slot) {
      takeIcon(side, slot)
      return
    }
    const hit = util.getObjectAt(position)
    const gadget = gadgetOf(hit)
    if (gadget?.leaving || gadget?.growing) {
      return
    }
    if (menu.isOpen() && gadget && isSet(gadget) && !gadget.icon) {
      gather(side, gadget)
      return
    }
    grab.pressed(side, hit, gadget)
    // Picked up whole (not by a part) with the menu open
    if (menu.isOpen() && gadget && grab.heldIn(side) === gadget && !gadget.icon) {
      shrinkToIcon(side, gadget)
    }
  }
  else {
    grab.gadgetOfHand(side)?.module.buttonPressed?.(side, button)
  }
}

export function buttonReleased (side, button) {
  if (button === 'grab') {
    if (taking[side]) {
      taking[side] = null
      return
    }
    const dropped = grab.released(side)
    if (dropped?.icon) {
      letGoIcon(dropped, hand.getPosition(side))
    }
    else if (dropped && !dropped.leaving) {
      cameToRest(dropped, side)
    }
  }
  else {
    grab.gadgetOfHand(side)?.module.buttonReleased?.(side, button)
  }
}

export function update () {
  if (watch.update()) {
    menu.toggle()
    if (menu.isOpen()) {
      // The code of every gadget, so summoning one doesn't wait for it
      gadgets.forEach(gadget => gadget.load())
      // What the hands hold turns into icons: a gadget shrinks, a part of
      // a set brings the whole set
      for (const side of ['left', 'right']) {
        const gadget = grab.gadgetOfHand(side)
        if (!gadget || gadget.icon || gadget.leaving) {
          continue
        }
        if (isSet(gadget)) {
          gather(side, gadget)
        }
        else if (grab.heldIn(side) === gadget) {
          shrinkToIcon(side, gadget)
        }
      }
    }
  }
  menu.update(['left', 'right']
    .filter(side => grab.heldIn(side)?.icon || taking[side])
    .map(side => hand.getPosition(side)))
  runAnimations()
  grab.update()
  recordHands()
  physics.step()
  updateBodies()
  for (const gadget of instances.values()) {
    if (!gadget.leaving && !gadget.icon) {
      gadget.module.update?.()
    }
  }
}

// Centre of the gadgets in the world, or of the open menu, for alignToHead
export function focusPoint () {
  if (menu.isOpen()) {
    return menu.center()
  }
  const box = new THREE.Box3()
  for (const gadget of instances.values()) {
    for (const object of gadget.root.parent ? [gadget.root] : gadget.module.parts?.() ?? []) {
      box.expandByObject(object)
    }
  }
  return box.isEmpty() ? null : box.getCenter(new THREE.Vector3())
}

function forward (method) {
  return (...args) => {
    for (const gadget of instances.values()) {
      gadget.module[method]?.(...args)
    }
  }
}

export const mousePressed = forward('mousePressed')
export const mouseReleased = forward('mouseReleased')
export const mouseMoved = forward('mouseMoved')
export const keyPressed = forward('keyPressed')
export const keyReleased = forward('keyReleased')
