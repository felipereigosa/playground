import * as THREE from 'three'
import * as util from './util.js'

// Picking gadgets up, holding them, passing them from hand to hand and
// letting go, shared by every gadget.
//
// A gadget is {name, module, root}. On a grab, the gadget held in the other
// hand and then the gadget under the hand each get the first say through
// their module's grabPressed(side, hit) (hit: the object whose collision
// mesh the hand is in), which returns true when it takes the grab itself:
// the calculator's lid, a tile, the cube's two-handed turn. It then hears
// about the release through grabReleased(side). Otherwise, if the hand is in
// the gadget's own collision mesh (the one directly under its root), the
// gadget is picked up.
//
// Grip points: an empty named grip_<name> under a gadget's root is where the
// right controller's grip frame goes while holding the gadget there. A hand
// that closes within GRIP_REACH of one takes the gadget by it: the gadget
// slides into that pose in GRIP_SLIDE seconds. The left hand uses the grip
// mirrored across the root's x = 0 plane (the left hand model is the right
// one mirrored), or grip_<name>_left when there is one. Elsewhere the
// gadget is held as it was, unless its module exports gripsOnly = true.

const held = {left: null, right: null}    // gadget in each hand
const parts = {left: null, right: null}   // gadget that took each hand's grab
const grips = {left: null, right: null}   // name of the grip each hand holds by
const slides = {left: null, right: null}  // gadgets sliding into a grip pose

const GRIP_REACH = 0.06
const GRIP_SLIDE = 0.1

export const other = side => side === 'left' ? 'right' : 'left'

export function heldIn (side) {
  return held[side]
}

export function holder (gadget) {
  return held.left === gadget ? 'left' : held.right === gadget ? 'right' : null
}

// The name of the grip the hand holds its gadget by, or null
export function gripOf (side) {
  return held[side] ? grips[side] : null
}

// The gadget's grips for a hand, each as {name, position, quaternion} of the
// grip frame in the root's space, the root's scale left out
function gripsFor (side, gadget) {
  const result = []
  for (const child of gadget.root.children) {
    const match = child.name.match(/^grip_(.+?)(_left)?$/)
    if (!match || (side === 'right' && match[2])) {
      continue
    }
    const name = match[1]
    const position = child.position.clone()
    const quaternion = child.quaternion.clone()
    if (side === 'left' && !match[2]) {
      if (gadget.root.getObjectByName(`grip_${name}_left`)) {
        continue
      }
      position.x *= -1
      quaternion.y *= -1
      quaternion.z *= -1
    }
    result.push({name, position, quaternion})
  }
  return result
}

// The grip nearest the hand within reach, or null
function gripNear (side, gadget) {
  if (gadget.icon) {
    return null
  }
  const at = avatar.controllers[side].getWorldPosition(new THREE.Vector3())
  let best = null
  let bestDistance = GRIP_REACH
  for (const grip of gripsFor(side, gadget)) {
    const distance = gadget.root.localToWorld(grip.position.clone()).distanceTo(at)
    if (distance < bestDistance) {
      best = grip
      bestDistance = distance
    }
  }
  return best
}

export function take (side, gadget, grip = null) {
  const from = holder(gadget)
  if (from) {
    held[from] = null
    slides[from] = null
  }
  util.transferChild(gadget.root, gadget.root.parent, avatar.controllers[side])
  held[side] = gadget
  grips[side] = grip?.name || null
  slides[side] = null
  if (grip) {
    // The root's pose in the controller's space puts the grip on it
    const root = gadget.root
    const quaternion = grip.quaternion.clone().invert()
    const position = grip.position.clone().multiplyScalar(root.scale.x)
      .applyQuaternion(quaternion).negate()
    slides[side] = {
      gadget, start: performance.now(), position, quaternion,
      fromPosition: root.position.clone(), fromQuaternion: root.quaternion.clone(),
    }
  }
  util.pulse(side, 1, 50)
}

// Every frame: moves gadgets taken by a grip into its pose
export function update () {
  for (const side of ['left', 'right']) {
    const slide = slides[side]
    if (!slide) {
      continue
    }
    if (held[side] !== slide.gadget) {
      slides[side] = null
      continue
    }
    const t = Math.min((performance.now() - slide.start) / 1000 / GRIP_SLIDE, 1)
    const k = t * t * (3 - 2 * t)
    const root = slide.gadget.root
    root.position.lerpVectors(slide.fromPosition, slide.position, k)
    root.quaternion.slerpQuaternions(slide.fromQuaternion, slide.quaternion, k)
    if (t === 1) {
      slides[side] = null
    }
  }
}

// Lets go into the world, where the gadget stays floating
export function drop (side) {
  const gadget = held[side]
  if (gadget) {
    util.transferChild(gadget.root, gadget.root.parent, scene)
    held[side] = null
    slides[side] = null
  }
  return gadget
}

// Lets go of the gadget but leaves it the hand's grab, for a gadget that
// turns holding into something else (the cube's two-handed turn)
export function dropKeepingGrab (side) {
  parts[side] = drop(side)
}

// Forgets a gadget that is going away
export function forget (gadget) {
  for (const side of ['left', 'right']) {
    if (held[side] === gadget) held[side] = null
    if (slides[side]?.gadget === gadget) slides[side] = null
    if (parts[side] === gadget) parts[side] = null
  }
}

// Returns whether anything took the grab
export function pressed (side, hit, hitGadget) {
  for (const gadget of [held[other(side)], hitGadget]) {
    if (gadget?.module.grabPressed?.(side, hit)) {
      parts[side] = gadget
      return true
    }
  }
  if (hitGadget && hit === hitGadget.root) {
    const grip = gripNear(side, hitGadget)
    if (grip || !hitGadget.module.gripsOnly || hitGadget.icon) {
      take(side, hitGadget, grip)
      return true
    }
  }
  return false
}

// Returns the gadget the hand was holding, if it was, now let go
export function released (side) {
  if (held[side]) {
    return drop(side)
  }
  const gadget = parts[side]
  if (gadget) {
    parts[side] = null
    gadget.module.grabReleased?.(side)
  }
  return null
}

// The gadget a hand's other buttons go to: the one it holds or works
export function gadgetOfHand (side) {
  return held[side] || parts[side]
}
