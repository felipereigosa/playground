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
  scene.add(root)
  return gadget
}

function despawn (gadget) {
  grab.forget(gadget)
  gadget.root.removeFromParent()
  gadget.module.dispose?.()
  instances.delete(gadget.name)
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

// Grabbing a small copy in the menu: the gadget (made now, or brought from
// wherever it is) appears where the copy was and grows to full size in the
// hand, keeping the point the hand closed on in the hand
// The slot each hand is summoning from, cleared if the hand lets go before
// the gadget is ready, in which case it grows where the copy was instead
const summoning = {left: null, right: null}

async function summon (side, slot) {
  summoning[side] = slot
  const gadget = await spawn(slot.name)
  const stillHeld = summoning[side] === slot
  summoning[side] = null
  if (gadget.leaving) {
    return
  }
  const holder = grab.holder(gadget)
  if (holder) {
    grab.drop(holder)
  }
  const root = gadget.root
  scene.add(root)
  slot.mini.updateMatrixWorld(true)
  slot.mini.matrixWorld.decompose(root.position, root.quaternion, root.scale)
  const startScale = root.scale.x
  if (stillHeld) {
    grab.take(side, gadget)
  }

  // In the space of the hand (or the world, if let go already): the copy's
  // pose, the point held (the hand, or the gadget's origin), and the turn it
  // ends at, which is the copy's without its spin, tipped towards the eyes
  const startPosition = root.position.clone()
  const startQuaternion = root.quaternion.clone()
  const anchor = stillHeld ? new THREE.Vector3() : startPosition.clone()
  const held = anchor.clone().sub(startPosition)
    .applyQuaternion(startQuaternion.clone().invert()).divideScalar(startScale)
  const upright = slot.pivot.parent.getWorldQuaternion(new THREE.Quaternion())
    .multiply(slot.mini.quaternion)
  const endQuaternion = root.parent.getWorldQuaternion(new THREE.Quaternion())
    .invert().multiply(upright)
  gadget.growing = true

  animate(t => {
    const k = smooth(Math.min(t / 0.35, 1))
    const scale = THREE.MathUtils.lerp(startScale, gadget.scale, k)
    root.scale.setScalar(scale)
    root.quaternion.slerpQuaternions(startQuaternion, endQuaternion, k)
    // Keeps the point held where the hand is
    root.position.copy(anchor)
      .sub(held.clone().multiplyScalar(scale).applyQuaternion(root.quaternion))
    if (k === 1) {
      gadget.growing = false
      return true
    }
  })
}

// Letting go of a gadget in the open menu: it shrinks into its slot and goes
function putAway (gadget, slot) {
  gadget.leaving = true
  grab.forget(gadget)
  const root = gadget.root
  const from = {
    position: root.position.clone(),
    quaternion: root.quaternion.clone(),
    scale: root.scale.x,
  }
  animate(t => {
    const k = smooth(Math.min(t / 0.3, 1))
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
      return true
    }
  })
}

export function buttonPressed (side, button) {
  if (button === 'grab') {
    const position = hand.getPosition(side)
    const slot = menu.slotAt(position)
    if (slot) {
      summon(side, slot)
      return
    }
    const hit = util.getObjectAt(position)
    const gadget = gadgetOf(hit)
    if (gadget?.leaving) {
      return
    }
    grab.pressed(side, hit, gadget)
  }
  else {
    grab.gadgetOfHand(side)?.module.buttonPressed?.(side, button)
  }
}

export function buttonReleased (side, button) {
  if (button === 'grab') {
    summoning[side] = null
    const dropped = grab.released(side)
    if (dropped && menu.isOpen()) {
      const slot = menu.slotForPutAway(dropped.name, hand.getPosition(side))
      if (slot) {
        putAway(dropped, slot)
      }
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
  menu.update()
  runAnimations()
  for (const gadget of instances.values()) {
    if (!gadget.leaving) {
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
