import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as hand from './hand.js'
import { gadgets } from './gadgets.js'

// The gadget menu the watch opens: a small copy of every gadget on an arc in
// front of the chest, turning slowly, with its name under it. Closing a hand
// on a copy summons the gadget (world.js); letting go of a held gadget near
// the arc puts it away into its slot.

const MINI_SIZE = 0.09       // the copies fit in a cube this big (m)
const RADIUS = 0.4           // from the head
const DROP = 0.22            // below the eyes
const SPACING = 0.3          // between slots, radians around the head
const REACH = 0.07           // how near a hand has to be to a copy
const PUT_AWAY_REACH = 0.16  // and to the arc to put a gadget away

// Model files are fetched once, for the copies here and the gadgets later
THREE.Cache.enabled = true

let group = null
let open = false
const slots = []   // {name, pivot, mini, scale}

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
    const angle = (i - (gadgets.length - 1) / 2) * SPACING
    slot.position.set(Math.sin(angle) * RADIUS, -DROP, -Math.cos(angle) * RADIUS)
    slot.rotation.y = -angle
    group.add(slot)

    // Turns about the vertical
    const pivot = new THREE.Group()
    slot.add(pivot)
    pivot.add(mini)
    mini.position.set(0, 0, 0)
    mini.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(mini)
    const size = box.getSize(new THREE.Vector3())
    const fit = MINI_SIZE / Math.max(size.x, size.y, size.z)
    mini.scale.multiplyScalar(fit)
    mini.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-fit))

    slot.add(backing())
    slot.add(label(gadget.label))
    slots.push({name: gadget.name, slot, pivot, mini, scale: 0})
  }
}

function backing () {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(MINI_SIZE * 0.75, 40),
    new THREE.MeshBasicMaterial({color: 0x203040, transparent: true, opacity: 0.25,
                                 depthWrite: false})
  )
  disc.position.z = -MINI_SIZE * 0.6
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
  plane.position.y = -MINI_SIZE * 0.75
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

export function center () {
  const box = new THREE.Box3()
  for (const {pivot} of slots) {
    box.expandByPoint(pivot.getWorldPosition(new THREE.Vector3()))
  }
  return box.getCenter(new THREE.Vector3())
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
  for (const slot of slots) {
    const d = distanceTo(slot, position)
    if (d < REACH && (!best || d < distanceTo(best, position))) {
      best = slot
    }
  }
  return best
}

// The slot to put a gadget away into, if it is let go near the arc
export function slotForPutAway (name, position) {
  if (!open || !slots.some(slot => distanceTo(slot, position) < PUT_AWAY_REACH)) {
    return null
  }
  return slots.find(slot => slot.name === name)
}

export function update () {
  if (!group) {
    return
  }
  const hands = ['left', 'right'].map(side => hand.getPosition(side))
  for (const slot of slots) {
    const near = open && hands.some(position => distanceTo(slot, position) < REACH)
    const target = open ? (near ? 1.25 : 1) : 0
    slot.scale += (target - slot.scale) * 0.25
    slot.slot.scale.setScalar(Math.max(slot.scale, 0.001))
    slot.pivot.rotation.y += near ? 0.03 : 0.01
  }
  if (!open && slots.every(slot => slot.scale < 0.01)) {
    group.visible = false
  }
}
