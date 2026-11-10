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

const held = {left: null, right: null}    // gadget in each hand
const parts = {left: null, right: null}   // gadget that took each hand's grab

export const other = side => side === 'left' ? 'right' : 'left'

export function heldIn (side) {
  return held[side]
}

export function holder (gadget) {
  return held.left === gadget ? 'left' : held.right === gadget ? 'right' : null
}

export function take (side, gadget) {
  const from = holder(gadget)
  if (from) {
    held[from] = null
  }
  util.transferChild(gadget.root, gadget.root.parent, avatar.controllers[side])
  held[side] = gadget
  util.pulse(side, 1, 50)
}

// Lets go into the world, where the gadget stays floating
export function drop (side) {
  const gadget = held[side]
  if (gadget) {
    util.transferChild(gadget.root, gadget.root.parent, scene)
    held[side] = null
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
    take(side, hitGadget)
    return true
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
