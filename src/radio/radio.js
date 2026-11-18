import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import * as util from '../util.js'
import * as hand from '../hand.js'
import * as grab from '../grab.js'
import * as sound from './sound.js'

// A portable radio (assets/radio/radio.glb, made by
// scripts/radio/export-radio.py, which says what its parts are). In the
// root's space x is to the right seen from the front, y up, z out of the
// front.
//   The red button on top switches it on and off, staying down while it is
//   on; the strip of numbers then glows. The black one beside it seeks: the
//   needle runs on to the next station, from the last back to the first.
//   The dial turns with a hand closed in front of it, by as much as the hand
//   turns, and moves the needle; music comes in and goes out through static
//   (sound.js).
//   The wheel on the side is the volume: a fingertip passing along its rim
//   rolls it.
//   The antenna is taken by its tip: it swings on its hinge and pulls out
//   to follow the hand, the thin tube first and then the medium one with
//   it, and stays. Down or folded, the signal is weaker.
// Both buttons are pressed with the tip of a pointing finger, like the
// calculator's keys.

// On a surface it stands on its feet
export const rest = {up: [0, 1, 0]}

const DIAL_TURN = THREE.MathUtils.degToRad(300)     // of the knob, end to end
const WHEEL_TURN = THREE.MathUtils.degToRad(200)    // of the wheel, silent to full
const TRAVEL = 0.007        // of a button, metres
const BELOW = 0.1           // how far under its top a fingertip still holds it down
const AWAY = 0.03           // tip this far above it: ready to be pressed again
const GLOW = new THREE.Color(1, 0.72, 0.3)

// One radio at a time, so its state can live in the module
let state = null

function hiddenBox (name, parent, size, position) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial())
  box.name = name
  box.position.set(...position)
  box.visible = false
  parent.add(box)
  return box
}

export async function create () {
  const gltf = await new GLTFLoader().loadAsync('radio/radio.glb')
  const root = gltf.scene.getObjectByName('radio')
  const part = name => root.getObjectByName(name)
  const measures = root.userData

  root.traverse(child => {
    if (child.isMesh && !child.name.startsWith('collision')) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  util.metal(root)
  util.hideCollisionMeshes(root)

  state = {
    root,
    on: false,
    t: 0,                   // the needle, 0 to 1 along the dial
    volume: 0.6,
    glow: 0,
    last: performance.now(),
    knob: part('knob'),
    knobSide: null,         // the hand turning it
    knobTurn: null,         // that hand's turn last frame, in the root's space
    needle: part('needle'),
    strip: part('strip'),
    wheel: part('wheel'),
    wheelAngles: {left: null, right: null},   // each fingertip's angle round it last frame
    buttons: {},
    seeking: null,
    antenna: [part('antenna'), part('antenna_medium'), part('antenna_thin')],
    antennaAngle: 0,        // up from lying along the top, radians
    antennaOut: 0,          // 0 pushed in, 1 pulled out
    thinOut: 0,             // how far the thin tube is out of the medium one, metres
    mediumOut: 0,           // and the medium one out of the thick one
    antennaHold: null,
    locked: -1,             // station the needle sits on
    measures,
    playing: sound.playing,
  }

  // What a hand takes the dial and the antenna by. A hand turning the dial
  // is in front of it, not in it. The radio's own box goes last, for these
  // to be found first where they overlap it.
  const reach = 0.12
  hiddenBox('collision_knob', state.knob, [0.11, 0.11, reach + 0.02],
    [0, 0, measures.knobFront + reach / 2 - 0.01])
  hiddenBox('collision_tip', state.antenna[2], [0.09, 0.09, 0.09], [measures.tipReach, 0, 0])
  root.add(root.children.find(child => child.name === 'collision'))

  for (const name of ['power', 'seek']) {
    const [x, top, z, halfX, halfZ] = measures[name]
    const object = part(name)
    state.buttons[name] = {object, rest: object.position.y, x, top, z, halfX, halfZ, depth: 0, armed: true}
  }

  // The strip lights up from behind: its own picture as the light's shape
  const material = state.strip.material
  material.emissive = GLOW.clone()
  material.emissiveMap = material.map
  material.emissiveIntensity = 0

  await sound.create(part('speaker'), measures.stations)
  if (!state) {
    return root             // put away while loading
  }
  // Starts on the first station, so switching it on gives music
  state.t = sound.dial()[0] ?? measures.stations[0]
  root.userData.state = state      // for the tests
  show()
  return root
}

export function dispose () {
  sound.dispose()
  state = null
}

function holding (side) {
  return grab.heldIn(side)?.root === state.root
}

// A hand that is not carrying the radio or working one of its parts
function free (side) {
  return !holding(side) && state.knobSide !== side && state.antennaHold?.side !== side
}

function tipIn (side) {
  return state.root.worldToLocal(hand.getTipPosition(side))
}

export function grabPressed (side, hit) {
  if (hit === state.knob) {
    state.knobSide = side
    state.knobTurn = turnOf(side)
    state.seeking = null
    return true
  }
  if (hit === state.antenna[2]) {
    const {angle, reach} = towards(side)
    state.antennaHold = {
      side,
      angle: angle - state.antennaAngle,
      reach: reach - tipReach(),
    }
    return true
  }
  return false
}

export function grabReleased (side) {
  if (state.knobSide === side) {
    state.knobSide = null
  }
  if (state.antennaHold?.side === side) {
    state.antennaHold = null
  }
}

// The dial. The hand's turn about the dial's axis since last frame goes to
// the needle; clockwise is up the dial
function turnOf (side) {
  const rootTurn = state.root.getWorldQuaternion(new THREE.Quaternion())
  return rootTurn.invert().multiply(
    avatar.controllers[side].getWorldQuaternion(new THREE.Quaternion()))
}

function turnDial () {
  const side = state.knobSide
  if (!side) {
    return
  }
  const now = turnOf(side)
  const step = now.clone().multiply(state.knobTurn.clone().invert())
  state.knobTurn = now
  let angle = 2 * Math.atan2(step.z, step.w)
  if (angle > Math.PI) angle -= 2 * Math.PI
  if (angle < -Math.PI) angle += 2 * Math.PI
  state.t = THREE.MathUtils.clamp(state.t - angle / DIAL_TURN, 0, 1)
}

function seek () {
  const dial = sound.dial()
  if (!state.on || !dial.length) {
    return
  }
  const next = dial.find(t => t > state.t + 0.02)
  const to = next ?? dial[0]
  state.seeking = {from: state.t, to, start: performance.now(), seconds: next === undefined ? 1.1 : 0.5}
}

function runSeek () {
  const seeking = state.seeking
  if (!seeking) {
    return
  }
  const k = Math.min((performance.now() - seeking.start) / 1000 / seeking.seconds, 1)
  state.t = THREE.MathUtils.lerp(seeking.from, seeking.to, k * k * (3 - 2 * k))
  if (k === 1) {
    state.seeking = null
  }
}

function power (side) {
  state.on = !state.on
  state.seeking = null
  sound.clickSound()
  util.pulse(side, 0.7, 40)
}

// The buttons go down under a pointing fingertip, and act halfway. Like the
// watch's (src/watch.js), one stays down however deep the finger goes on,
// and doesn't act again until the tip has come back out above it and AWAY:
// pushing too far, or pulling back out through it, is still one press.
function pressButtons () {
  for (const [name, button] of Object.entries(state.buttons)) {
    let depth = 0
    let by = null
    let clear = true
    for (const side of ['left', 'right']) {
      if (!free(side)) {
        continue
      }
      const tip = tipIn(side)
      const over = Math.abs(tip.x - button.x) < button.halfX + 0.004 &&
        Math.abs(tip.z - button.z) < button.halfZ + 0.004
      if (over && hand.isPointing(side) &&
          tip.y < button.top + 0.002 && tip.y > button.top - BELOW) {
        const pressed = Math.min(button.top - tip.y, TRAVEL)
        if (pressed > depth) {
          depth = pressed
          by = side
        }
      }
      if ((over && tip.y < button.top && tip.y > button.top - BELOW - 0.02) ||
          tip.distanceTo(new THREE.Vector3(button.x, button.top, button.z)) < AWAY) {
        clear = false
      }
    }
    if (button.armed && depth > 0.6 * TRAVEL) {
      button.armed = false
      if (name === 'power') {
        power(by)
      }
      else {
        seek()
        util.pulse(by, 0.5, 40)
      }
    }
    else if (!button.armed && clear) {
      button.armed = true
    }
    // The red one stays partly down while the radio is on
    const held = name === 'power' && state.on ? 0.45 * TRAVEL : 0
    const target = Math.max(depth, held)
    button.depth = target > button.depth ? target : Math.max(target, button.depth - 0.0012)
    button.object.position.y = button.rest - button.depth
  }
}

// The volume wheel follows a fingertip along the part of its rim that
// sticks out of the side
function rollWheel () {
  const [x, y, z] = state.measures.wheelAt
  const radius = state.measures.wheelRadius
  for (const side of ['left', 'right']) {
    let angle = null
    if (free(side)) {
      const tip = tipIn(side)
      const out = Math.hypot(tip.x - x, tip.y - y)
      if (Math.abs(tip.z - z) < state.measures.wheelWidth / 2 + 0.015 &&
          out > radius - 0.025 && out < radius + 0.02 && tip.x > x + 0.55 * radius) {
        angle = Math.atan2(tip.y - y, tip.x - x)
      }
    }
    const before = state.wheelAngles[side]
    state.wheelAngles[side] = angle
    if (angle === null || before === null) {
      continue
    }
    const volume = THREE.MathUtils.clamp(state.volume + (angle - before) / WHEEL_TURN, 0, 1)
    // A tick in the finger every twentieth of the way
    if (Math.floor(volume * 20) !== Math.floor(state.volume * 20)) {
      util.pulse(side, 0.3, 15)
    }
    state.wheel.rotation.z += (volume - state.volume) * WHEEL_TURN
    state.volume = volume
  }
}

// The antenna. Its tip follows the hand that took it: round the hinge, and
// out along itself
const slide = () => state.measures.slides[0] + state.measures.slides[1]
const tipReach = () => state.measures.tipReach + state.antennaOut * slide()

// Where the hand is from the hinge, in the plane the antenna swings in
function towards (side) {
  const point = state.root.worldToLocal(hand.getPosition(side)).sub(state.antenna[0].position)
  return {angle: Math.atan2(point.y, point.x), reach: Math.hypot(point.x, point.y)}
}

function moveAntenna () {
  const hold = state.antennaHold
  if (hold) {
    const {angle, reach} = towards(hold.side)
    // Between lying to the right and lying to the left, over the top
    let turn = angle - hold.angle
    while (turn > 1.5 * Math.PI) turn -= 2 * Math.PI
    while (turn < -0.5 * Math.PI) turn += 2 * Math.PI
    state.antennaAngle = THREE.MathUtils.clamp(turn, 0, Math.PI)
    extend(reach - hold.reach - state.measures.tipReach)
  }
}

// The head this far out along the antenna from where it is pushed in, as
// far as the tubes allow. The thin tube carries the head, so it moves all
// the way; the first of that it slides out of the medium tube, and from
// there on it takes the medium tube along, out of the thick one, which
// never slides. Pushing back in is the same the other way round.
function extend (by) {
  const [mediumMax, thinMax] = state.measures.slides
  const out = THREE.MathUtils.clamp(by, 0, mediumMax + thinMax)
  state.thinOut = Math.min(out, thinMax)
  state.mediumOut = out - state.thinOut
  state.antennaOut = out / slide()
}

// 0 to 1: best pulled out and upright
function reception () {
  return state.antennaOut * (0.5 + 0.5 * Math.sin(state.antennaAngle))
}

// The parts where the state says
function show () {
  const [from, to] = state.measures.needle
  state.needle.position.x = THREE.MathUtils.lerp(from, to, state.t)
  state.knob.rotation.z = -(state.t - 0.5) * DIAL_TURN
  state.strip.material.emissiveIntensity = 0.75 * state.glow
  state.antenna[0].rotation.z = state.antennaAngle
  state.antenna[1].position.x = state.mediumOut
  state.antenna[2].position.x = state.thinOut
}

export function update () {
  if (!state?.root.userData.state) {
    return                  // still loading
  }
  const now = performance.now()
  const dt = Math.min((now - state.last) / 1000, 0.1)
  state.last = now

  turnDial()
  runSeek()
  pressButtons()
  rollWheel()
  moveAntenna()

  // A tap in the hand as the needle comes onto a station
  const near = sound.nearest(state.t)
  const locked = state.on && near.clarity === 1 ? near.index : -1
  if (locked >= 0 && locked !== state.locked && state.knobSide) {
    util.pulse(state.knobSide, 0.4, 20)
  }
  state.locked = locked

  state.glow += ((state.on ? 1 : 0) - state.glow) * Math.min(dt * 10, 1)
  show()
  sound.update(state.on, state.t, state.volume, reception())
}
