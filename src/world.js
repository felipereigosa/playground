import * as THREE from 'three'
import * as player from './player.js'
import * as util from './util.js'
import * as hand from './hand.js'
import * as grab from './grab.js'
import * as watch from './watch.js'
import * as menu from './menu.js'
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
    row.push(await spawn(name))
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
  const slot = menu.slotForPutAway(gadget.name, position)
  if (slot) {
    putAway(gadget, slot)
    return
  }
  menu.close()
  gadget.growing = true
  resize(gadget, gadget.scale, position, 0.35, () => {
    gadget.icon = false
    gadget.growing = false
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
    }
  }
  menu.update(['left', 'right']
    .filter(side => grab.heldIn(side)?.icon || taking[side])
    .map(side => hand.getPosition(side)))
  runAnimations()
  grab.update()
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
    box.expandByObject(gadget.root)
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
