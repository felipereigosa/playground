import * as THREE from 'three'

// A hand followed by the headset's hand tracking, from three's
// renderer.xr.getHand(i): drawn as sticks between its tracked joints, white
// when open, orange when clenched and blue when pointing (with a thin ray
// from the index tip). Used by the playground (hand.js) and the ?hands demo.

const fingers = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal',
          'thumb-phalanx-distal', 'thumb-tip'],
}
for (const f of ['index', 'middle', 'ring', 'pinky']) {
  fingers[f] = [`${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`,
                `${f}-finger-phalanx-intermediate`,
                `${f}-finger-phalanx-distal`, `${f}-finger-tip`]
}
// Every stick, as a pair of joints: each finger from the wrist to its tip,
// plus a line across the knuckles to show the palm
const sticks = []
for (const chain of Object.values(fingers)) {
  ['wrist', ...chain].forEach((joint, i, all) => {
    if (i > 0) sticks.push([all[i - 1], joint])
  })
}
const knuckles = ['index', 'middle', 'ring', 'pinky']
  .map(f => `${f}-finger-phalanx-proximal`)
knuckles.forEach((joint, i) => {
  if (i > 0) sticks.push([knuckles[i - 1], joint])
})

const colors = {
  open: new THREE.Color(0xeeeeee),
  clenched: new THREE.Color(0xff8800),
  pointing: new THREE.Color(0x22aaff),
}

// A finger counts as curled when its tip comes closer to the wrist than this
// many palm lengths (wrist to middle knuckle), and as straight beyond the
// second number. An open hand measures about 1.9, a fist about 0.7. The gap
// between the two numbers stops a hand on the edge from flickering.
const curled = 1.3
const straight = 1.6

const v = () => new THREE.Vector3()

// `source` is renderer.xr.getHand(i), added to `parent` (whatever its joints
// are relative to: the scene, or the avatar); the sticks go in the scene
export function create (source, parent, scene) {
  parent.add(source)
  const material = new THREE.MeshStandardMaterial({color: colors.open})
  const stickGeometry = new THREE.CylinderGeometry(0.004, 0.004, 1, 6)
    .translate(0, 0.5, 0).rotateX(Math.PI / 2)  // along +z, from 0 to 1
  const ballGeometry = new THREE.SphereGeometry(0.006, 8, 6)
  const group = new THREE.Group()
  group.name = 'tracked-hand'
  group.visible = false
  scene.add(group)
  const hand = {
    source, material, group,
    side: null,  // 'left' or 'right' while connected
    sticks: sticks.map(pair => {
      const mesh = new THREE.Mesh(stickGeometry, material)
      group.add(mesh)
      return {pair, mesh}
    }),
    balls: [...new Set(sticks.flat())].map(name => {
      const mesh = new THREE.Mesh(ballGeometry, material)
      group.add(mesh)
      return {name, mesh}
    }),
    // The pointing ray, from the index tip
    ray: new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 1, 4)
                          .translate(0, 0.5, 0).rotateX(Math.PI / 2),
                        new THREE.MeshBasicMaterial({color: colors.pointing,
                                                     transparent: true,
                                                     opacity: 0.6})),
    clenched: false,
    pointing: false,
  }
  hand.ray.scale.z = 2
  group.add(hand.ray)
  source.addEventListener('connected', event => {
    hand.side = event.data.hand ? event.data.handedness : null
  })
  source.addEventListener('disconnected', () => {
    hand.side = null
    hand.clenched = hand.pointing = false
  })
  return hand
}

// World position of a joint, or null when it isn't tracked
export function position (hand, name) {
  const joint = hand.source.joints[name]
  return joint?.visible ? joint.getWorldPosition(v()) : null
}

export function isTracked (hand) {
  return !!(hand.side && hand.source.visible && position(hand, 'wrist'))
}

// How far each fingertip is from the wrist, in palm lengths
export function measure (hand) {
  const wrist = position(hand, 'wrist')
  const knuckle = position(hand, 'middle-finger-phalanx-proximal')
  if (!wrist || !knuckle) return null
  const palm = wrist.distanceTo(knuckle)
  const result = {}
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const tip = position(hand, `${f}${f === 'thumb' ? '' : '-finger'}-tip`)
    if (!tip) return null
    result[f] = tip.distanceTo(wrist) / palm
  }
  return result
}

// Updates hand.clenched and hand.pointing. While the hand isn't tracked they
// keep their last values, so losing the hand for a moment drops nothing.
export function classify (hand) {
  const m = measure(hand)
  if (!m) return
  const others = [m.middle, m.ring, m.pinky]
  // Clenched: all four fingers curled (the thumb is left free)
  hand.clenched = Math.max(m.index, ...others) <
    (hand.clenched ? straight : curled)
  // Pointing: index straight, the other three curled
  hand.pointing = !hand.clenched && m.index > straight &&
    Math.max(...others) < (hand.pointing ? straight : curled)
}

// The middle of the fist: halfway between the wrist and the middle knuckle,
// pushed a little towards the curled fingers
export function fistCentre (hand) {
  const wrist = position(hand, 'wrist')
  const knuckle = position(hand, 'middle-finger-phalanx-proximal')
  const tip = position(hand, 'middle-finger-tip')
  if (!wrist || !knuckle || !tip) return null
  return wrist.add(knuckle).multiplyScalar(0.5).lerp(tip, 0.3)
}

export function draw (hand) {
  const tracked = isTracked(hand)
  hand.group.visible = tracked
  if (!tracked) return

  hand.material.color.copy(hand.clenched ? colors.clenched
    : hand.pointing ? colors.pointing : colors.open)
  for (const {pair: [a, b], mesh} of hand.sticks) {
    const from = position(hand, a)
    const to = position(hand, b)
    mesh.visible = !!(from && to)
    if (!mesh.visible) continue
    mesh.position.copy(from)
    mesh.lookAt(to)
    mesh.scale.set(1, 1, Math.max(from.distanceTo(to), 0.001))
  }
  for (const {name, mesh} of hand.balls) {
    const p = position(hand, name)
    mesh.visible = !!p
    if (p) mesh.position.copy(p)
  }

  const tip = position(hand, 'index-finger-tip')
  const base = position(hand, 'index-finger-phalanx-proximal')
  hand.ray.visible = hand.pointing && !!tip && !!base
  if (hand.ray.visible) {
    hand.ray.position.copy(tip)
    hand.ray.lookAt(tip.clone().add(tip.clone().sub(base)))
  }
}
