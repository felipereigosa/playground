import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from '../util.js'
import * as hits from '../hits.js'
import * as player from '../player.js'

// Targets: a set of floating octagonal shells laid out ahead of where its
// icon is let go, facing back at that spot, nearer if the room is too short.
// Each is one colour: bands of it and of white in turn around a white
// centre. One that is shot (hits.js) rings, the band that was struck glows,
// its bands jump apart for a moment with light in the grooves between them,
// and the points for that band (50 in the centre, 10 less each band out)
// rise above it and fade. Each can be carried somewhere else by hand. The
// model (target.glb, built by scripts/targets) faces +z and has its parts as
// separate objects: base, glow (the plate seen in the grooves), ring_* from
// the rim inwards, centre; the names say the colours of the concept, which
// are replaced here.

const NAME = 'targets'
// Where each goes from the spot the icon was let go: metres to the right,
// up and ahead
const LAYOUT = [
  [-1.6, 0.2, 4],
  [0, 0.5, 5.5],
  [1.5, 0.1, 4.5],
  [-0.8, 0.9, 7],
  [1, 1.0, 8],
]
const LOWEST = 0.5          // metres above the floor, at least
const ROOM = 5.6            // they stay this near the middle of the room (x and z)
const RINGS = ['ring_white', 'ring_red', 'ring_yellow', 'ring_teal', 'centre']
const SPREAD = 0.012        // metres each ring jumps ahead of the one around it
const SWELL = 0.05          // and how much wider the rings get
const OUT = 0.06            // seconds for the rings to jump apart
const BACK = 0.55           // and to settle again
const GLOW = 0x5ff4ff
const WHITE = 0xf4f1e8
const COLOURS = [0xd8322b, 0xf5b81c, 0x19b3b8, 0x3f6fe0, 0x58b947]   // one per target
const POINTS = {centre: 50, ring_teal: 40, ring_yellow: 30, ring_red: 20, ring_white: 10}
const NUMBER = 0.16         // metres tall
const NUMBER_LIFE = 0.9     // seconds
const NUMBER_RISE = 0.25    // metres

let state = null

// One target in a colour: a copy of the model with materials of its own, to
// glow alone
function make (colour = COLOURS[0]) {
  const target = state.model.clone()
  target.userData.colour = colour
  target.traverse(child => {
    if (child.isMesh && !child.name.startsWith('collision')) {
      child.material = child.material.clone()
      const band = RINGS.indexOf(child.name)
      if (band >= 0) {
        child.material.color.set(band % 2 ? colour : WHITE)
      }
      child.material.emissive.set(child.name === 'glow' ? GLOW : child.material.color)
      child.material.emissiveIntensity = 0
      child.castShadow = true
    }
  })
  util.hideCollisionMeshes(target)
  return target
}

const meshes = part => part.children.filter(child => child.isMesh && !child.name.startsWith('collision'))

export async function create () {
  const gltf = await new GLTFLoader().loadAsync('targets/target.glb')
  state = {model: gltf.scene.getObjectByName('target'), parts: [], numbers: [], textures: new Map(),
           held: {left: null, right: null}, ding: dings()}
  return make()
}

// How much of the way from `from` along `offset` stays inside the room
function reach (from, offset) {
  let most = 1
  for (const axis of ['x', 'z']) {
    if (Math.abs(from[axis] + offset[axis]) > ROOM) {
      const wall = Math.sign(offset[axis]) * ROOM
      most = Math.min(most, Math.max((wall - from[axis]) / offset[axis], 0))
    }
  }
  return most
}

export function deploy (position, facing) {
  const right = new THREE.Vector3(-facing.z, 0, facing.x)
  const offsets = LAYOUT.map(([x, y, z]) =>
    new THREE.Vector3().addScaledVector(right, x).addScaledVector(facing, z))
  // The whole layout pulled in by the same amount, so it keeps its shape
  const fit = Math.min(...offsets.map(offset => reach(position, offset)))
  for (const [i, offset] of offsets.entries()) {
    const part = make(COLOURS[i % COLOURS.length])
    part.userData.gadget = NAME
    part.position.copy(position).addScaledVector(offset, fit)
    part.position.x = THREE.MathUtils.clamp(part.position.x, -ROOM, ROOM)
    part.position.z = THREE.MathUtils.clamp(part.position.z, -ROOM, ROOM)
    part.position.y = Math.max(position.y + LAYOUT[i][1], LOWEST)
    part.rotation.y = Math.atan2(position.x - part.position.x, position.z - part.position.z)
    Object.assign(part.userData, {struck: -1e9, ring: null, hits: 0, score: 0})
    scene.add(part)
    for (const mesh of meshes(part)) {
      hits.add(mesh, () => struck(part, mesh.name))
    }
    state.parts.push(part)
  }
}

export function parts () {
  return state.parts
}

export function stow () {
  for (const part of state.parts) {
    for (const mesh of meshes(part)) {
      hits.remove(mesh)
      mesh.material.dispose()
    }
    part.removeFromParent()
  }
  state.parts = []
  state.held = {left: null, right: null}
  for (const number of state.numbers) {
    number.removeFromParent()
    number.material.dispose()
  }
  state.numbers = []
}

export function dispose () {
  stow()
  state.textures.forEach(texture => texture.dispose())
  state = null
}

function struck (part, name) {
  part.userData.struck = performance.now()
  part.userData.ring = name
  part.userData.hits++
  state.ding(part)
  if (POINTS[name]) {
    part.userData.score += POINTS[name]
    number(part, POINTS[name])
  }
}

// The points, in the target's colour with a pale glow, drawn once for each
// number and colour
function numberTexture (points, colour) {
  const key = points + ' ' + colour
  if (!state.textures.has(key)) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const context = canvas.getContext('2d')
    context.font = 'bold 96px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = 'white'
    context.shadowBlur = 18
    context.fillStyle = 'white'
    context.fillText(points, 128, 68)
    context.shadowBlur = 0
    context.fillStyle = '#' + new THREE.Color(colour).lerp(new THREE.Color('white'), 0.35).getHexString()
    context.fillText(points, 128, 68)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    state.textures.set(key, texture)
  }
  return state.textures.get(key)
}

// A number starts just above the target, facing whoever looks, and rises
// as it fades (update)
function number (part, points) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: numberTexture(points, part.userData.colour), transparent: true, depthWrite: false}))
  sprite.scale.set(NUMBER * 2, NUMBER, 1)
  part.getWorldPosition(sprite.position)
  sprite.position.y += 0.2 + NUMBER / 2
  sprite.userData = {born: performance.now(), from: sprite.position.y, points}
  scene.add(sprite)
  state.numbers.push(sprite)
}

// A target is carried by hand, and stays upright where it is left, facing
// the way it was held
export function grabPressed (side, hit) {
  if (!state.parts.includes(hit) || Object.values(state.held).includes(hit)) {
    return false
  }
  util.transferChild(hit, hit.parent, avatar.controllers[side])
  state.held[side] = hit
  util.pulse(side, 1, 50)
  return true
}

export function grabReleased (side) {
  const part = state.held[side]
  state.held[side] = null
  if (part?.parent) {
    util.transferChild(part, part.parent, scene)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(part.quaternion)
    part.rotation.set(0, Math.atan2(forward.x, forward.z), 0)
  }
}

// The rings jump apart fast and settle slowly; 0 at rest, 1 fully apart
function apart (age) {
  return age < OUT ? age / OUT : Math.max(1 - (age - OUT) / BACK, 0) ** 2
}

export function update () {
  const now = performance.now()
  state.numbers = state.numbers.filter(sprite => {
    const t = (now - sprite.userData.born) / 1000 / NUMBER_LIFE
    if (t >= 1) {
      sprite.removeFromParent()
      sprite.material.dispose()
      return false
    }
    // Up quickly, then slower; there at once, gone gradually
    sprite.position.y = sprite.userData.from + NUMBER_RISE * (1 - (1 - t) ** 2)
    sprite.material.opacity = 0.85 * Math.min(t * 12, 1) * (1 - t * t)
    return true
  })
  for (const part of state.parts) {
    const k = apart((now - part.userData.struck) / 1000)
    for (const mesh of meshes(part)) {
      const i = RINGS.indexOf(mesh.name) + 1
      if (i > 0) {
        mesh.position.z = i * SPREAD * k
        mesh.scale.setScalar(1 + SWELL * k)
      }
      mesh.material.emissiveIntensity =
        mesh.name === 'glow' ? 2 * k : mesh.name === part.userData.ring ? 0.9 * k : 0
    }
  }
}

// The ring of a struck target: two partials dying away, from where it is
function dings () {
  const listener = player.getListener()
  const context = listener.context
  const length = Math.floor(context.sampleRate * 0.6)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const t = i / context.sampleRate
    data[i] = (Math.sin(2 * Math.PI * 1568 * t) * Math.exp(-t * 9) +
               0.5 * Math.sin(2 * Math.PI * 2637 * t) * Math.exp(-t * 14)) * 0.5
  }
  return part => {
    const voice = new THREE.PositionalAudio(listener)
    voice.setBuffer(buffer)
    voice.setRefDistance(4)
    voice.onEnded = () => voice.removeFromParent()
    part.add(voice)
    voice.play()
  }
}
