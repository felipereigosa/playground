import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as hand from './hand.js'
import { gadgets } from './gadgets.js'

// The gadget menu the watch opens: a small copy of every gadget not out in
// the world, on an arc in front of the chest, turning slowly, with its name
// under it. Closing a hand on a copy takes the gadget out as an icon
// (world.js) and its entry off the arc. Carrying an icon near the arc opens
// an empty spot at the place nearest the hand, the others sliding apart;
// letting go there puts the gadget away into that spot, which is also how
// the arc is reordered.

const MINI_SIZE = 0.065      // the copies' sides average about this (m)
const MINI_MAX = 0.115       // and none is longer than this
const RADIUS = 0.4           // from the head
const DROP = 0.22            // below the eyes
const SPACING = 0.3          // between slots, radians around the head
const REACH = 0.07           // how near a hand has to be to a copy
const PUT_AWAY_REACH = 0.16  // and to the arc to put a gadget away

// Model files are fetched once, for the copies here and the gadgets later
THREE.Cache.enabled = true

let group = null
let open = false
// In arc order: {name, slot, pivot, mini, scale, angle, out}, `out` while
// the gadget is in the world, `angle` its place on the arc (radians), sliding
// to its target
const slots = []

// The empty spot: where on the arc it is (index among the entries shown),
// or null, and its object, an empty disc and name plate
let gap = null
let gapSlot = null

// Angle of place i of n on the arc, the arc centred in front
const arcAngle = (i, n) => (i - (n - 1) / 2) * SPACING

export async function create () {
  group = new THREE.Group()
  group.name = 'menu'
  group.visible = false
  scene.add(group)

  const loader = new GLTFLoader()
  for (const [i, gadget] of gadgets.entries()) {
    const gltf = await loader.loadAsync(gadget.model)
    const model = gadget.root
      ? gltf.scene.getObjectByName(gadget.root)
      : gltf.scene.children[0]
    const mini = model.clone()
    mini.traverse(child => {
      if (child.name.startsWith('collision')) {
        child.visible = false
        child.name = 'mini-' + child.name   // not grabbable
      }
    })

    // The slot faces the head; the pivot turns the copy about its centre
    const slot = new THREE.Group()
    group.add(slot)

    // The copy is turned so its face points at the viewer, then fitted and
    // centred in the pivot, which turns it about the vertical. Measured in a
    // group of its own, so the slot's place doesn't count.
    mini.position.set(0, 0, 0)
    if (gadget.menuTurn) {
      const turn = new THREE.Euler(...gadget.menuTurn.map(THREE.MathUtils.degToRad))
      mini.quaternion.premultiply(new THREE.Quaternion().setFromEuler(turn))
    }
    const measure = new THREE.Group()
    measure.add(mini)
    measure.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(mini)
    const size = box.getSize(new THREE.Vector3())
    // Sized by the average of its sides (the thinnest counted as at least
    // half the middle one), so a solid cube and a flat calculator look
    // about as big: flat things are seen at a slant, a cube from every side
    const [a, b, c] = [size.x, size.y, size.z].sort((p, q) => q - p)
    const average = Math.cbrt(a * b * Math.max(c, b / 2))
    const fit = Math.min(MINI_SIZE / average, MINI_MAX / a) * (gadget.menuScale ?? 1)
    mini.scale.multiplyScalar(fit)
    mini.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-fit))
    const pivot = new THREE.Group()
    slot.add(pivot)
    pivot.add(mini)

    slot.add(backing())
    slot.add(label(gadget.label))
    slot.userData.name = gadget.name
    slots.push({name: gadget.name, slot, pivot, mini, scale: 0, angle: null, out: false})
  }

  const empty = new THREE.Group()
  empty.add(backing())
  empty.add(label(''))
  group.add(empty)
  gapSlot = {slot: empty, scale: 0, angle: null}
}

// A gadget being put away is flying onto its copy, which waits hidden and
// still for it, so there is only one; once it lands the copy shows and
// starts turning from there. `quaternion` is the gadget's turn in the world
// when let go: the copy waits at the turn about the vertical that the gadget
// has once tipped upright by the smallest turn (its spin axis to the menu's
// up), so it lands without spinning round.
export function arriving (name, yes, quaternion) {
  const slot = slots.find(slot => slot.name === name)
  slot.arriving = yes
  slot.mini.visible = !yes
  if (!yes) {
    return
  }
  const own = slot.mini.quaternion
  slot.slot.updateMatrixWorld(true)
  const menuTurn = slot.slot.getWorldQuaternion(new THREE.Quaternion())
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(own.clone().invert()).applyQuaternion(quaternion).normalize()
  const menuUp = new THREE.Vector3(0, 1, 0).applyQuaternion(menuTurn)
  const upright = new THREE.Quaternion().setFromUnitVectors(up, menuUp).multiply(quaternion)
  // What is left is a turn about the pivot's vertical
  const turn = menuTurn.clone().invert().multiply(upright).multiply(own.clone().invert())
  slot.pivot.rotation.y = 2 * Math.atan2(turn.y, turn.w)
}

// The scale a gadget has as an icon: its copy's
export function iconScale (name) {
  return slots.find(slot => slot.name === name).mini.scale.x
}

// Takes a gadget's entry off the arc while it is in the world, or puts it back
export function setOut (name, out) {
  const slot = slots.find(slot => slot.name === name)
  if (slot) {
    slot.out = out
  }
}

function place (slot, angle) {
  slot.angle = angle
  slot.slot.position.set(Math.sin(angle) * RADIUS, -DROP, -Math.cos(angle) * RADIUS)
  slot.slot.rotation.y = -angle
}

function backing () {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(MINI_SIZE * 0.95, 40),
    new THREE.MeshBasicMaterial({color: 0x203040, transparent: true, opacity: 0.25,
                                 depthWrite: false})
  )
  disc.position.z = -MINI_SIZE * 0.8
  return disc
}

function label (text) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgba(20, 30, 45, 0.75)'
  context.beginPath()
  context.roundRect(0, 0, 256, 64, 24)
  context.fill()
  context.fillStyle = 'white'
  context.font = '36px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 128, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 0.02),
    new THREE.MeshBasicMaterial({map: texture, transparent: true})
  )
  plane.position.y = -MINI_SIZE * 0.95
  return plane
}

export function isOpen () {
  return open
}

// Opens around the head, facing where it looks (turned about the vertical
// only, so the arc stays level)
export function toggle () {
  open = !open
  if (open) {
    const head = camera.getWorldPosition(new THREE.Vector3())
    const forward = camera.getWorldDirection(new THREE.Vector3())
    group.position.copy(head)
    group.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0)
    group.visible = true
  }
}

export function close () {
  open = false
}

// The middle of the arc
export function center () {
  return group.localToWorld(new THREE.Vector3(0, -DROP, -RADIUS))
}

function distanceTo (slot, position) {
  return slot.pivot.getWorldPosition(new THREE.Vector3()).distanceTo(position)
}

// The slot whose copy a hand at this position is on, if the menu is open
export function slotAt (position) {
  if (!open) {
    return null
  }
  let best = null
  for (const slot of slots.filter(slot => !slot.out)) {
    const d = distanceTo(slot, position)
    if (d < REACH && (!best || d < distanceTo(best, position))) {
      best = slot
    }
  }
  return best
}

// Where an empty spot would open for a hand carrying a gadget at this
// position: its index among the entries shown, or null when the hand isn't
// near the arc (as long as it would be with the spot added)
function gapFor (position) {
  if (!open) {
    return null
  }
  const n = slots.filter(slot => !slot.out).length + 1
  const local = group.worldToLocal(position.clone())
  const angle = Math.atan2(local.x, -local.z)
  const index = THREE.MathUtils.clamp(Math.round(angle / SPACING + (n - 1) / 2), 0, n - 1)
  const spot = arcAngle(index, n)
  const near = local.distanceTo(new THREE.Vector3(
    Math.sin(spot) * RADIUS, -DROP, -Math.cos(spot) * RADIUS)) < PUT_AWAY_REACH
  return near ? index : null
}

// Letting go of a gadget here: if that is in the empty spot, its entry moves
// there (it comes back on the arc once world.js calls setOut) and is
// returned, for the gadget to shrink into
export function slotForPutAway (name, position) {
  const index = gapFor(position)
  const slot = slots.find(slot => slot.name === name)
  if (index === null || !slot) {
    return null
  }
  const shown = slots.filter(other => !other.out && other !== slot)
  slots.splice(slots.indexOf(slot), 1)
  const before = shown[index]
  slots.splice(before ? slots.indexOf(before) : slots.length, 0, slot)
  // It takes the spot's place (where the spot is heading), so it neither
  // flies in from its old one nor slides after landing
  place(slot, arcAngle(index, shown.length + 1))
  gap = null
  return slot
}

// carrying: positions of the hands holding an icon
export function update (carrying = []) {
  if (!gapSlot) {   // still being made
    return
  }
  gap = carrying.map(gapFor).find(index => index !== null) ?? null

  // The entries on the arc, with the empty spot if there is one, spread
  // evenly; one coming back grows in at its place, the others slide over
  const shown = slots.filter(slot => !slot.out)
  const places = [...shown]
  if (gap !== null) {
    places.splice(gap, 0, gapSlot)
  }
  for (const [i, slot] of places.entries()) {
    const angle = arcAngle(i, places.length)
    place(slot, slot.angle === null || slot.scale < 0.01
      ? angle
      : slot.angle + (angle - slot.angle) * 0.2)
  }
  gapSlot.scale += ((open && gap !== null ? 1 : 0) - gapSlot.scale) * 0.25
  gapSlot.slot.scale.setScalar(Math.max(gapSlot.scale, 0.001))

  const hands = ['left', 'right'].map(side => hand.getPosition(side))
  for (const slot of slots) {
    const near = open && !slot.out &&
      hands.some(position => distanceTo(slot, position) < REACH)
    const target = open && !slot.out ? (near ? 1.25 : 1) : 0
    slot.scale += (target - slot.scale) * 0.25
    slot.slot.scale.setScalar(Math.max(slot.scale, 0.001))
    if (!slot.arriving) {
      slot.pivot.rotation.y += near ? 0.03 : 0.01
    }
  }
  if (!open && slots.every(slot => slot.scale < 0.01) && gapSlot.scale < 0.01) {
    group.visible = false
  }
}
