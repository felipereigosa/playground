import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from '../util.js'
import * as physics from '../physics.js'
import * as grab from '../grab.js'
import * as player from '../player.js'

// Bowling: a set of a ball and ten pins. The ball floats where the icon was
// let go (its home) and the pins stand racked on the floor ahead of there,
// nearer if the room is too short. A hand that closes anywhere on the ball
// gets it the same way every time, turned into the hold of its grip_hold
// (the fingers at the holes); let go, it flies with the hand's speed. Pins
// can be carried and thrown too.
//
// The lane runs itself, as a real one does. A roll is over when everything
// has come to rest (or after ROLL_MOST seconds): the ball floats back home,
// and if pins fell, their number rises over the rack and they are taken
// away. After the second such roll, or when none is left standing, all ten
// are set up again. A roll that fells nothing is not counted.
//
// The model (bowling.glb, built by scripts/bowling) has the icon (`bowling`:
// a ball and a pin), `ball` (radius RADIUS, with grip_hold) and `pin` (its
// origin under its base). The pin's shape in the physics is made here
// (HULL), not taken from the model.

const NAME = 'bowling'
const RADIUS = 0.108
const BALL_MASS = 6
const PIN_MASS = 1.5
const PIN_CENTRE = 0.147    // metres from a pin's base up to its centre of mass
// A pin for the physics: six sided rings, as [height, radius]
const HULL = [[0, 0.027], [0.1143, 0.0635], [0.343, 0.034], [0.381, 0.015]]
const SPACING = 0.3048      // between neighbouring pins
const AHEAD = 5             // metres from the ball's home to the head pin
const MARGIN = 0.6          // the pins stay this far from the walls
const LOWEST = 0.6          // the ball's home is at least this high
const THROW = 1.25          // times the hand's speed
const THROW_WINDOW = 0.1    // seconds of hand movement a throw's speed comes from
const SLIDE = 0.1           // seconds for the ball to turn into the hand's hold
const ROLL_MOST = 10        // seconds
const STILL = 0.7           // seconds of nothing moving that end a roll
const RERACK_AFTER = 1.2    // seconds from the end of a roll to setting up
const LEANING = 0.9         // a pin stands while its axis is this upright (cos)

const materials = {ball: new CANNON.Material('ball'), pin: new CANNON.Material('pin')}
physics.world.addContactMaterial(new CANNON.ContactMaterial(
  materials.ball, materials.pin, {restitution: 0.45, friction: 0.2}))
physics.world.addContactMaterial(new CANNON.ContactMaterial(
  materials.pin, materials.pin, {restitution: 0.4, friction: 0.3}))

let state = null

const smooth = t => t * t * (3 - 2 * t)
const seconds = () => performance.now() / 1000

export async function create () {
  const gltf = await new GLTFLoader().loadAsync('bowling/bowling.glb')
  const model = name => gltf.scene.getObjectByName(name)
  state = {
    models: {ball: model('ball'), pin: model('pin')},
    env: util.reflections(),
    ball: null, pins: [], home: new THREE.Vector3(), centre: new THREE.Vector3(),
    held: {left: null, right: null}, trail: {left: [], right: []},
    slide: null, moves: [], signs: [], roll: null, throws: 0, rerackAt: null,
    sounds: sounds(), last: seconds(),
  }
  gltf.scene.traverse(child => {
    if (child.isMesh && !child.name.startsWith('collision')) {
      child.castShadow = true
      child.material.envMap = state.env
      child.material.envMapIntensity = child.material.name === 'purple' ? 1 : 0.35
    }
  })
  util.hideCollisionMeshes(gltf.scene)
  return model('bowling')
}

// ---------------------------------------------------------------- bodies

function pinShape () {
  const sides = 6
  const vertices = []
  for (const [height, radius] of HULL) {
    for (let i = 0; i < sides; i++) {
      const angle = 2 * Math.PI * i / sides
      vertices.push(new CANNON.Vec3(radius * Math.cos(angle), height - PIN_CENTRE, radius * Math.sin(angle)))
    }
  }
  const ring = k => [...Array(sides).keys()].map(i => k * sides + i)
  const faces = [ring(0), ring(HULL.length - 1).reverse()]
  for (let k = 0; k < HULL.length - 1; k++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides
      faces.push([k * sides + i, (k + 1) * sides + i, (k + 1) * sides + j, k * sides + j])
    }
  }
  return new CANNON.ConvexPolyhedron({vertices, faces})
}

// A part's body is where the part is; a pin's has its origin at the pin's
// centre of mass, PIN_CENTRE up its axis
function toBody (part) {
  scene.updateMatrixWorld(true)
  const quaternion = part.getWorldQuaternion(new THREE.Quaternion())
  const position = part.getWorldPosition(new THREE.Vector3())
  if (part !== state.ball) {
    position.add(new THREE.Vector3(0, PIN_CENTRE, 0).applyQuaternion(quaternion))
  }
  part.body.position.set(position.x, position.y, position.z)
  part.body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
  return position
}

function fromBody (part) {
  part.quaternion.copy(part.body.quaternion)
  part.position.copy(part.body.position)
  if (part !== state.ball) {
    part.position.sub(new THREE.Vector3(0, PIN_CENTRE, 0).applyQuaternion(part.quaternion))
  }
}

function makeBody (part) {
  const ball = part === state.ball
  const body = new CANNON.Body({
    mass: ball ? BALL_MASS : PIN_MASS,
    material: ball ? materials.ball : materials.pin,
    shape: ball ? new CANNON.Sphere(RADIUS) : pinShape(),
    linearDamping: 0.05,
    angularDamping: ball ? 0.1 : 0.3,
  })
  body.allowSleep = true
  body.sleepSpeedLimit = 0.15
  body.sleepTimeLimit = 0.5
  body.addEventListener('collide', event => struck(part, event))
  part.body = body
}

// In the world at rest where the part is (asleep), or out of it
function embody (part, on = true) {
  if (on && !part.body.world) {
    toBody(part)
    part.body.type = CANNON.Body.DYNAMIC
    part.body.velocity.set(0, 0, 0)
    part.body.angularVelocity.set(0, 0, 0)
    physics.world.addBody(part.body)
    part.body.sleep()
  }
  else if (!on && part.body.world) {
    physics.world.removeBody(part.body)
  }
}

function struck (part, event) {
  const speed = Math.abs(event.contact.getImpactVelocityAlongNormal())
  const other = event.body.material
  if (part === state?.ball) {
    if (!other && speed > 0.8) {
      state.sounds.thud(part, speed)
    }
  }
  else if (speed > 0.4 && state?.pins.includes(part)) {
    state.sounds.clack(part, speed)
  }
}

// ------------------------------------------------------------------ the set

// The pins' places for a ball at `home` thrown along `facing`: the rack
// pulled in if the room is too short, then moved as far as it takes to be
// inside the walls
function spots (home, facing) {
  const right = new THREE.Vector3(-facing.z, 0, facing.x)
  const depth = SPACING * Math.sqrt(3) / 2
  const inside = physics.ROOM - MARGIN
  const room = Math.min(...['x', 'z'].map(axis => Math.abs(facing[axis]) < 1e-6
    ? Infinity : (Math.sign(facing[axis]) * inside - home[axis]) / facing[axis]))
  const ahead = Math.max(Math.min(AHEAD, room - 3 * depth), 1.5)
  const places = []
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      places.push(new THREE.Vector3(home.x, 0, home.z)
        .addScaledVector(facing, ahead + row * depth)
        .addScaledVector(right, (i - row / 2) * SPACING))
    }
  }
  const box = new THREE.Box3().setFromPoints(places)
  for (const axis of ['x', 'z']) {
    const shift = Math.max(-inside - box.min[axis], 0) + Math.min(inside - box.max[axis], 0)
    places.forEach(place => { place[axis] += shift })
  }
  return places
}

export function deploy (position, facing) {
  state.home.copy(position)
  state.home.y = Math.max(position.y, LOWEST)
  state.ball = state.models.ball.clone()
  state.ball.userData.gadget = NAME
  state.ball.position.copy(state.home)
  state.ball.quaternion.identity()
  scene.add(state.ball)
  makeBody(state.ball)
  const places = spots(state.home, facing)
  state.centre.copy(new THREE.Box3().setFromPoints(places).getCenter(new THREE.Vector3()))
  for (const spot of places) {
    const pin = state.models.pin.clone()
    pin.userData.gadget = NAME
    pin.spot = spot
    pin.position.copy(spot)
    pin.quaternion.identity()
    scene.add(pin)
    makeBody(pin)
    embody(pin)
    state.pins.push(pin)
  }
  state.ball.lane = state     // for the tests
}

export function parts () {
  return [state.ball, ...state.pins].filter(part => part?.parent)
}

export function stow () {
  for (const part of [state.ball, ...state.pins]) {
    if (part) {
      embody(part, false)
      part.removeFromParent()
    }
  }
  for (const sign of state.signs) {
    sign.removeFromParent()
    sign.material.map.dispose()
    sign.material.dispose()
  }
  Object.assign(state, {ball: null, pins: [], held: {left: null, right: null}, slide: null,
                        moves: [], signs: [], roll: null, throws: 0, rerackAt: null})
}

export function dispose () {
  stow()
  state = null
}

// ---------------------------------------------------------------- the hands

export function grabPressed (side, hit) {
  if (hit !== state.ball && !state.pins.includes(hit)) {
    return false
  }
  const other = grab.other(side)
  if (state.held[other] === hit) {
    state.held[other] = null
  }
  state.moves = state.moves.filter(move => move.part !== hit)
  const controller = avatar.controllers[side]
  util.transferChild(hit, hit.parent, controller)
  state.held[side] = hit
  state.trail[side] = []
  if (hit === state.ball) {
    // Into the hold of its grip, wherever it was taken
    const grip = grab.gripsFor(side, {root: hit})[0]
    if (grip) {
      const quaternion = grip.quaternion.clone().invert()
      state.slide = {
        side, start: seconds(), quaternion,
        position: grip.position.clone().applyQuaternion(quaternion).negate(),
        fromPosition: hit.position.clone(), fromQuaternion: hit.quaternion.clone(),
      }
    }
  }
  // It goes along with the hand, and knocks what it meets
  if (!hit.body.world) {
    physics.world.addBody(hit.body)
  }
  hit.body.type = CANNON.Body.KINEMATIC
  hit.body.allowSleep = false
  hit.body.wakeUp()
  hit.body.velocity.set(0, 0, 0)
  hit.body.angularVelocity.set(0, 0, 0)
  toBody(hit)
  util.pulse(side, 1, 50)
  return true
}

export function grabReleased (side) {
  const part = state.held[side]
  state.held[side] = null
  if (!part || part.parent !== avatar.controllers[side]) {
    return
  }
  if (state.slide?.side === side) {
    state.slide = null
  }
  util.transferChild(part, part.parent, scene)
  const velocity = handVelocity(side).multiplyScalar(THROW)
  const body = part.body
  toBody(part)
  body.type = CANNON.Body.DYNAMIC
  body.allowSleep = true
  body.velocity.set(velocity.x, velocity.y, velocity.z)
  body.angularVelocity.set(0, 0, 0)
  body.wakeUp()
  if (part === state.ball) {
    state.roll = {start: seconds(), still: 0}
  }
}

function handVelocity (side) {
  const [first, last] = [state.trail[side][0], state.trail[side].at(-1)]
  return first && last.time > first.time
    ? last.position.clone().sub(first.position).divideScalar(last.time - first.time)
    : new THREE.Vector3()
}

// ----------------------------------------------------------------- the lane

const standing = pin => pin.parent &&
  new THREE.Vector3(0, 1, 0).applyQuaternion(pin.getWorldQuaternion(new THREE.Quaternion())).y > LEANING

const isHeld = part => Object.values(state.held).includes(part)

function moving (part) {
  const body = part.body
  return part.parent && !isHeld(part) && body.world && body.sleepState !== CANNON.Body.SLEEPING &&
    (body.velocity.length() > 0.1 || body.angularVelocity.length() > 0.6)
}

// Flies a part to a place over some seconds, lifted by `arc` on the way;
// its body stays out of the world meanwhile
function move (part, to, time, {arc = 0, quaternion = null, scale = null, done = null} = {}) {
  embody(part, false)
  state.moves = state.moves.filter(other => other.part !== part)
  state.moves.push({
    part, to, time, arc, quaternion, scale, done, start: seconds(),
    from: part.position.clone(), fromQuaternion: part.quaternion.clone(), fromScale: part.scale.x,
  })
}

function runMoves (now) {
  for (const item of [...state.moves]) {
    const {part} = item
    const t = Math.min((now - item.start) / item.time, 1)
    const k = smooth(t)
    part.position.lerpVectors(item.from, item.to, k)
    part.position.y += item.arc * Math.sin(Math.PI * k)
    if (item.quaternion) {
      part.quaternion.slerpQuaternions(item.fromQuaternion, item.quaternion, k)
    }
    if (item.scale !== null) {
      part.scale.setScalar(THREE.MathUtils.lerp(item.fromScale, item.scale, k))
    }
    if (t === 1) {
      state.moves.splice(state.moves.indexOf(item), 1)
      item.done?.()
    }
  }
}

function endRoll () {
  state.roll = null
  const ball = state.ball
  if (!isHeld(ball)) {
    move(ball, state.home, 0.9, {arc: 0.4})
  }
  const down = state.pins.filter(pin => pin.parent && !isHeld(pin) && !standing(pin))
  if (down.length === 0) {
    return
  }
  state.throws++
  const left = state.pins.filter(standing).length
  sign(left > 0 ? String(down.length) : state.throws === 1 ? 'Strike' : 'Spare')
  for (const pin of down) {
    move(pin, pin.position.clone(), 0.3, {scale: 0.001, done: () => pin.removeFromParent()})
  }
  if (left === 0 || state.throws === 2) {
    state.rerackAt = seconds() + RERACK_AFTER
  }
}

// All ten back on their spots, the ones that were taken away growing again
function rerack () {
  state.rerackAt = null
  state.throws = 0
  for (const pin of state.pins.filter(pin => !isHeld(pin))) {
    if (!pin.parent) {
      pin.scale.setScalar(0.001)
      pin.position.copy(pin.spot).setY(0.5)
      pin.quaternion.identity()
      scene.add(pin)
    }
    move(pin, pin.spot, 0.5, {quaternion: new THREE.Quaternion(), scale: 1, done: () => embody(pin)})
  }
}

// What a roll did, rising over the rack and fading
function sign (text) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  context.font = 'bold 96px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.shadowColor = 'white'
  context.shadowBlur = 18
  context.fillStyle = 'white'
  context.fillText(text, 256, 68)
  context.shadowBlur = 0
  context.fillStyle = '#8a4be0'
  context.fillText(text, 256, 68)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, transparent: true, depthWrite: false}))
  sprite.scale.set(1.6, 0.4, 1)
  sprite.position.copy(state.centre).setY(0.8)
  sprite.userData = {born: seconds(), text}
  scene.add(sprite)
  state.signs.push(sprite)
}

function runSigns (now) {
  state.signs = state.signs.filter(sprite => {
    const t = (now - sprite.userData.born) / 1.6
    if (t >= 1) {
      sprite.removeFromParent()
      sprite.material.map.dispose()
      sprite.material.dispose()
      return false
    }
    sprite.position.y = 0.8 + 0.5 * (1 - (1 - t) ** 2)
    sprite.material.opacity = Math.min(t * 12, 1) * (1 - t * t)
    return true
  })
}

export function update () {
  const now = seconds()
  const dt = Math.max(now - state.last, 1e-3)
  state.last = now

  // The ball turning into the hand's hold
  const slide = state.slide
  if (slide) {
    const t = Math.min((now - slide.start) / SLIDE, 1)
    state.ball.position.lerpVectors(slide.fromPosition, slide.position, smooth(t))
    state.ball.quaternion.slerpQuaternions(slide.fromQuaternion, slide.quaternion, smooth(t))
    if (t === 1) {
      state.slide = null
    }
  }

  runMoves(now)

  // Held parts take their bodies along, at the speed they are moved; the
  // others follow theirs
  const inside = physics.ROOM - 0.3
  for (const part of parts()) {
    const body = part.body
    const side = state.held.left === part ? 'left' : state.held.right === part ? 'right' : null
    if (side) {
      const before = new THREE.Vector3().copy(body.position)
      const position = toBody(part)
      body.velocity.copy(position.clone().sub(before).divideScalar(dt))
      const trail = state.trail[side]
      trail.push({time: now, position})
      while (trail.length > 2 && now - trail[0].time > THROW_WINDOW) {
        trail.shift()
      }
    }
    else if (body.world) {
      const at = body.position
      if (at.y < -1 || Math.abs(at.x) > physics.ROOM || Math.abs(at.z) > physics.ROOM) {
        // Out of the room: back inside, at rest
        at.set(THREE.MathUtils.clamp(at.x, -inside, inside), 0.5, THREE.MathUtils.clamp(at.z, -inside, inside))
        body.velocity.set(0, 0, 0)
        body.angularVelocity.set(0, 0, 0)
      }
      fromBody(part)
    }
  }

  const roll = state.roll
  if (roll) {
    roll.still = parts().some(moving) ? 0 : roll.still + dt
    if (roll.still > STILL || now - roll.start > ROLL_MOST) {
      endRoll()
    }
  }
  if (state.rerackAt !== null && now > state.rerackAt) {
    rerack()
  }
  runSigns(now)
}

// ------------------------------------------------------------------- sounds

// A pin struck: a short woody knock; the ball landing: a low thump. Both
// made here, louder the harder the blow
function sounds () {
  const listener = player.getListener()
  const context = listener.context
  const make = (length, sample) => {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * length), context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = sample(i / context.sampleRate)
    }
    return buffer
  }
  const tone = (f, t) => Math.sin(2 * Math.PI * f * t)
  const buffers = {
    clack: make(0.15, t => 0.5 * tone(1180, t) * Math.exp(-t * 55) + 0.35 * tone(2050, t) * Math.exp(-t * 80) +
      0.5 * (Math.random() * 2 - 1) * Math.exp(-t * 160)),
    thud: make(0.3, t => 0.9 * tone(85 - 60 * t, t) * Math.exp(-t * 18) +
      0.15 * (Math.random() * 2 - 1) * Math.exp(-t * 90)),
  }
  let playing = 0
  const play = (name, most) => (part, speed) => {
    const now = seconds()
    if (playing >= 8 || now - (part.sounded ?? 0) < 0.08) {
      return
    }
    part.sounded = now
    playing++
    const voice = new THREE.PositionalAudio(listener)
    voice.setBuffer(buffers[name])
    voice.setRefDistance(3)
    voice.setVolume(Math.min(speed / most, 1))
    voice.setPlaybackRate(0.92 + Math.random() * 0.16)
    voice.onEnded = () => {
      playing--
      voice.removeFromParent()
    }
    part.add(voice)
    voice.play()
  }
  return {clack: play('clack', 4), thud: play('thud', 5)}
}
