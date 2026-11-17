import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from '../util.js'
import * as grab from '../grab.js'

// The Tripo blaster, in two halves: rear (pistol grip, grip_back) and front
// (foregrip, grip_front). It is only held by its grips (see grab.js). One
// hand holds the whole gun, docked. A second hand closing on the other grip
// pulls the halves apart: each half follows its hand, both turned to aim
// along the line from the back hand to the front hand while keeping each
// hand's roll, and a beam of light stretches between their sockets. When
// either hand lets go, the half in the hand that stays turns back to that
// hand's proper hold, about the hand, and the other half slides over to it.
// The trigger of the hand on grip_back fires an energy pulse.
export const gripsOnly = true

const REACH = 0.06          // metres from the free grip that the second hand takes it
const BEAM_SINK = 0.02      // metres the beam reaches into each half
const DOCK = 0.2            // seconds for the halves to slide back together and
                            // the gun to turn back to the hand's hold
const PULSE_SPEED = 30      // metres per second
const PULSE_LIFE = 1.5      // seconds
const PULSE_TAIL = 0.35     // metres
const FLASH_LIFE = 0.08     // seconds the muzzle plume lasts
const CYAN = 0x5ff4ff

let state = null

export async function create () {
  const gltf = await new GLTFLoader().loadAsync('gun/blaster.glb')
  const root = gltf.scene.getObjectByName('blaster')
  root.getObjectByName('collision').visible = false
  root.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true
    }
  })
  const rear = root.getObjectByName('rear')
  const front = root.getObjectByName('front')
  // The halves sit at the root's origin when docked, so the marks can move
  // into them unchanged
  rear.add(root.getObjectByName('socket_rear'))
  front.add(root.getObjectByName('socket_front'))
  front.add(root.getObjectByName('muzzle'))
  for (const [half, out] of [[rear, -1], [front, 1]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0018, 8, 24),
      new THREE.MeshBasicMaterial({color: CYAN}))
    ring.position.copy(half.getObjectByName(half === rear ? 'socket_rear' : 'socket_front').position)
    ring.position.z += out * 0.001
    half.add(ring)
  }
  const beam = makeBeam()
  root.add(beam)
  state = {root, rear, front, beam, stretch: null, docking: null, pulses: []}
  return root
}

// A thin bright core in a faint dark sleeve, held by three rings, along +y
// of a unit length (scaled to the gap each frame)
function makeBeam () {
  const beam = new THREE.Group()
  beam.name = 'beam'
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 8),
    new THREE.MeshBasicMaterial({color: 0xd8ffff}))
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 16, 1, true),
    new THREE.MeshBasicMaterial({color: 0x0c2a33, transparent: true, opacity: 0.45, depthWrite: false,
      side: THREE.DoubleSide}))
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 1, 12, 1, true),
    new THREE.MeshBasicMaterial({color: CYAN, transparent: true, opacity: 0.35, depthWrite: false,
      blending: THREE.AdditiveBlending}))
  beam.add(core, glow, sleeve)
  beam.userData.stretched = [core, glow, sleeve]
  beam.userData.rings = []
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Group()
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0022, 8, 24),
      new THREE.MeshStandardMaterial({color: 0x1a1c20, roughness: 0.6})))
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.0088, 0.0009, 6, 24),
      new THREE.MeshBasicMaterial({color: CYAN})))
    ring.rotation.x = Math.PI / 2
    beam.add(ring)
    beam.userData.rings.push(ring)
  }
  beam.visible = false
  return beam
}

export function dispose () {
  for (const pulse of state?.pulses || []) {
    pulse.removeFromParent()
  }
  state = null
}

function mine (gadget) {
  return gadget && gadget.root === state?.root
}

// The grip's world pose for a hand: where that hand's controller goes
function gripWorld (side, gadget, name) {
  const grip = grab.gripsFor(side, gadget).find(g => g.name === name)
  return grip && {
    position: gadget.root.localToWorld(grip.position.clone()),
    grip,
  }
}

export function grabPressed (side, hit) {
  const holding = grab.other(side)
  const gadget = grab.heldIn(holding)
  if (!mine(gadget) || state.stretch) {
    return false
  }
  const name = grab.gripOf(holding) === 'back' ? 'front' : 'back'
  const at = avatar.controllers[side].getWorldPosition(new THREE.Vector3())
  const free = gripWorld(side, gadget, name)
  if (!free || free.position.distanceTo(at) > REACH) {
    return false
  }
  state.stretch = {
    gadget,
    holder: holding,
    back: name === 'back' ? side : holding,
    front: name === 'front' ? side : holding,
  }
  state.docking = null
  state.settle = null
  util.pulse(side, 1, 50)
  return true
}

export function grabReleased (side) {
  if (state?.stretch) {
    endStretch(state.stretch.holder)
  }
}

// One hand let go: the half in the hand that stays keeps its pose, the
// gun's root moves to it (so it becomes the docked pose) and only the other
// half slides over to join it
function endStretch (stays) {
  const kept = state.stretch.back === stays ? state.rear : state.front
  const root = state.root
  for (const object of [root, state.rear, state.front]) {
    object.updateMatrix()
  }
  const keptLocal = kept.matrix.clone()
  root.matrix.multiply(keptLocal).decompose(root.position, root.quaternion, root.scale)
  const inverse = keptLocal.invert()
  for (const half of [state.rear, state.front]) {
    _m.multiplyMatrices(inverse, half.matrix).decompose(half.position, half.quaternion, _s)
    half.updateMatrix()
  }
  kept.position.set(0, 0, 0)
  kept.quaternion.identity()
  // The gun then turns back to the hand's proper hold, about the hand
  const name = kept === state.rear ? 'back' : 'front'
  const grip = grab.gripsFor(stays, state.stretch.gadget).find(g => g.name === name)
  const pivot = grip.position.clone().multiplyScalar(root.scale.x)
  const toQuaternion = grip.quaternion.clone().invert()
  state.settle = {
    side: stays,
    gadget: state.stretch.gadget,
    pivot,
    fromQuaternion: root.quaternion.clone(),
    toQuaternion,
    // where the grip point sits in the hand now; it ends at the hand's origin
    offset: root.position.clone().add(pivot.clone().applyQuaternion(root.quaternion)),
  }
  state.stretch = null
  state.docking = {
    start: performance.now(),
    from: [state.rear, state.front].map(half => [half.position.clone(), half.quaternion.clone()]),
  }
}

export function buttonPressed (side, button) {
  if (button !== 'trigger' || !state) {
    return
  }
  const onBack = state.stretch ? state.stretch.back === side : grab.gripOf(side) === 'back'
  if (onBack) {
    fire(side)
  }
}

// A cone along +y fading from white at its base to clear cyan at its tip
function fade (radius, length) {
  const geometry = new THREE.ConeGeometry(radius, length, 12, 4, true)
  const position = geometry.attributes.position
  const colors = []
  const white = new THREE.Color(0xffffff)
  const cyan = new THREE.Color(CYAN)
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / length + 0.5          // 0 base, 1 tip
    const c = white.clone().lerp(cyan, Math.min(t * 4, 1))
    colors.push(c.r, c.g, c.b, 0.9 * (1 - t) ** 2)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  geometry.translate(0, length / 2, 0)                 // base at the origin
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }))
}

// An energy pulse, as in First Steps: a short white-hot plume out of the
// muzzle that fades at once, and a bright head with a fading tail that flies
// off along the gun
function fire (side) {
  const muzzle = state.root.getObjectByName('muzzle')
  const from = muzzle.getWorldPosition(new THREE.Vector3())
  const direction = new THREE.Vector3(0, 0, -1).transformDirection(state.front.matrixWorld)
  const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

  const flash = fade(0.022, 0.2)
  flash.position.copy(from)
  flash.quaternion.copy(along)
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8),
    new THREE.MeshBasicMaterial({color: CYAN, transparent: true, opacity: 0.6, depthWrite: false}))
  flash.add(glow)
  flash.userData = {flash: true, born: performance.now()}

  const pulse = new THREE.Group()
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8),
    new THREE.MeshBasicMaterial({color: 0xffffff}))
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8),
    new THREE.MeshBasicMaterial({color: CYAN, transparent: true, opacity: 0.55, depthWrite: false}))
  const tail = fade(0.012, PULSE_TAIL)
  tail.rotation.x = Math.PI                            // trailing behind the head
  pulse.add(tail, halo, head)
  pulse.position.copy(from)
  pulse.quaternion.copy(along)
  pulse.userData = {direction, tail, born: performance.now()}
  tail.scale.y = 0                                     // the tail grows out of the muzzle

  scene.add(flash, pulse)
  state.pulses.push(flash, pulse)
  state.root.userData.shots = (state.root.userData.shots || 0) + 1
  util.pulse(side, 0.7, 40)
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()

// Where the root would be if this hand alone held the gun by this grip
function rootFor (side, gadget, name) {
  const grip = grab.gripsFor(side, gadget).find(g => g.name === name)
  const quaternion = grip.quaternion.clone().invert()
  const scale = gadget.root.scale.x
  const position = grip.position.clone().multiplyScalar(scale).applyQuaternion(quaternion).negate()
  const local = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(scale, scale, scale))
  return {matrix: avatar.controllers[side].matrixWorld.clone().multiply(local), grip}
}

function updateStretch () {
  const {gadget, back, front} = state.stretch
  const root = gadget.root
  root.updateMatrixWorld()
  const b = rootFor(back, gadget, 'back')
  const f = rootFor(front, gadget, 'front')
  const pb = avatar.controllers[back].getWorldPosition(new THREE.Vector3())
  const pf = avatar.controllers[front].getWorldPosition(new THREE.Vector3())
  // The docked back-grip-to-front-grip line, which the hands' line becomes
  const docked = f.grip.position.clone().sub(b.grip.position)
  const length = docked.length() * root.scale.x
  const aim = pf.clone().sub(pb)
  const distance = aim.length()
  aim.normalize()
  const rootInverse = root.matrixWorld.clone().invert()
  for (const [half, side, at, place] of [[state.rear, back, pb, b], [state.front, front, pf, f]]) {
    const line = docked.clone().transformDirection(place.matrix)
    const turn = new THREE.Quaternion().setFromUnitVectors(line, aim)
    // Turned about the hand, and the front kept out of the rear
    let pivot = at
    let target = at
    if (half === state.front) {
      target = pb.clone().addScaledVector(aim, Math.max(distance, length))
    }
    const world = new THREE.Matrix4().makeTranslation(target.x, target.y, target.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
      .multiply(place.matrix)
    _m.multiplyMatrices(rootInverse, world).decompose(half.position, half.quaternion, _s)
  }
}

function updateBeam () {
  const {root, rear, front, beam} = state
  const a = rear.getObjectByName('socket_rear').getWorldPosition(new THREE.Vector3())
  const b = front.getObjectByName('socket_front').getWorldPosition(new THREE.Vector3())
  root.worldToLocal(a)
  root.worldToLocal(b)
  const gap = a.distanceTo(b)
  beam.visible = gap > 0.01
  if (!beam.visible) {
    return
  }
  // Each end sunk into its half, so no gap shows at the uneven caps
  const along = b.clone().sub(a).normalize()
  a.addScaledVector(along, -BEAM_SINK)
  b.addScaledVector(along, BEAM_SINK)
  const length = gap + 2 * BEAM_SINK
  beam.position.copy(a).add(b).multiplyScalar(0.5)
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along)
  for (const part of beam.userData.stretched) {
    part.scale.y = length
  }
  beam.userData.rings.forEach((ring, i) => {
    ring.position.y = gap * ((i + 1) / 4 - 0.5)
  })
}

function updatePulses () {
  const now = performance.now()
  const dt = Math.min((now - (state.last ?? now)) / 1000, 0.05)
  state.last = now
  state.pulses = state.pulses.filter(pulse => {
    const age = (now - pulse.userData.born) / 1000
    if (age > (pulse.userData.flash ? FLASH_LIFE : PULSE_LIFE)) {
      pulse.removeFromParent()
      return false
    }
    if (pulse.userData.flash) {
      const k = 1 - age / FLASH_LIFE
      pulse.scale.set(k, 0.6 + 0.4 * k, k)
      return true
    }
    pulse.position.addScaledVector(pulse.userData.direction, PULSE_SPEED * dt)
    pulse.userData.tail.scale.y = Math.min(age * PULSE_SPEED / PULSE_TAIL, 1)
    return true
  })
}

export function update () {
  if (!state) {
    return
  }
  const stretch = state.stretch
  if (stretch && grab.holder(stretch.gadget) !== stretch.holder) {
    // The hand holding the gun let go: the other one takes it whole
    const stays = grab.other(stretch.holder)
    const name = stretch.back === stays ? 'back' : 'front'
    const grip = grab.gripsFor(stays, stretch.gadget).find(g => g.name === name)
    grab.take(stays, stretch.gadget, grip, false)
    endStretch(stays)
  }
  if (state.stretch) {
    updateStretch()
  }
  else if (state.docking) {
    const t = Math.min((performance.now() - state.docking.start) / 1000 / DOCK, 1)
    const k = t * t * (3 - 2 * t)
    ;[state.rear, state.front].forEach((half, i) => {
      const [position, quaternion] = state.docking.from[i]
      half.position.lerpVectors(position, new THREE.Vector3(), k)
      half.quaternion.slerpQuaternions(quaternion, _q.identity(), k)
    })
    // Only while that hand still holds it: let go, the gun stays where it is
    if (state.settle && grab.holder(state.settle.gadget) !== state.settle.side) {
      state.settle = null
    }
    const settle = state.settle
    if (settle) {
      const root = state.root
      root.quaternion.slerpQuaternions(settle.fromQuaternion, settle.toQuaternion, k)
      root.position.copy(settle.pivot).applyQuaternion(root.quaternion).negate()
        .addScaledVector(settle.offset, 1 - k)
      if (t === 1) {
        state.settle = null
      }
    }
    if (t === 1) {
      state.docking = null
    }
  }
  updateBeam()
  updatePulses()
}
