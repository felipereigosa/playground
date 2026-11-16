import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from './util.js'
import * as tracked from './tracked-hand.js'

// Each side's "controller" (avatar.controllers[side]) is the object the
// game hangs things on: the hand model, the watch, a held gadget. It follows
// the side's controller grip or, when the headset tracks that hand instead,
// the hand's wrist joint, placed so that the watch (modelled in the left
// grip's space) sits on the tracked wrist: see setWatchFrame. A tracked hand
// is drawn as sticks instead of the hand model; clenching it is a grab,
// grabbing at the middle of the palm, and pointing with it is pointing.

const grips = []        // three's controller grips, by input source index
const trackedHands = [] // three's tracked hands, the same
const lastClenched = {left: false, right: false}

// How far up the forearm from the wrist joint the middle of the watch's band
// goes, and where a tracked hand grabs, in the wrist joint's space (WebXR:
// -z towards the fingers, -y into the palm)
const WATCH_UP_ARM = 0.03
const GRAB_POINT = new THREE.Vector3(0, -0.025, -0.055)

// The watch's frame in each side's controller space (the right one mirrored),
// given by the watch: origin in the middle of the band, +y out of the face,
// -z towards the fingers, as the wrist joint's. Null until the watch loads.
const watchFrame = {left: null, right: null}

export function setWatchFrame (centre, outOfFace, towardsFingers) {
  for (const side of ['left', 'right']) {
    const mirror = v => side === 'left' ? v.clone() : v.clone().setX(-v.x)
    const y = mirror(outOfFace).normalize()
    const z = mirror(towardsFingers).negate()
    z.addScaledVector(y, -z.dot(y)).normalize()
    const x = new THREE.Vector3().crossVectors(y, z)
    watchFrame[side] = new THREE.Matrix4().makeBasis(x, y, z)
      .setPosition(mirror(centre))
  }
}

// Called once in VR capable browsers, before any track()
export function setupTracking () {
  for (let i = 0; i < 2; i++) {
    const grip = renderer.xr.getControllerGrip(i)
    grip.side = null
    grip.addEventListener('connected', event => {
      grip.side = event.data.handedness
    })
    grip.addEventListener('disconnected', () => { grip.side = null })
    avatar.add(grip)
    grips.push(grip)
    trackedHands.push(tracked.create(renderer.xr.getHand(i), avatar, scene))
  }
}

function trackedHand (side) {
  return trackedHands.find(hand => hand.side === side)
}

// Whether the side is a tracked hand rather than a controller now
export function isTracked (side) {
  return !!trackedHand(side)
}

// Every frame, before rendering: moves each side's controller object to its
// controller or hand, and returns the grabs started and ended by clenching
// tracked hands, as [{side, pressed}]
export function track () {
  const events = []
  for (const side of ['left', 'right']) {
    const controller = avatar.controllers[side]
    const hand = trackedHand(side)
    const grip = grips.find(grip => grip.side === side)
    const wrist = hand?.source.joints.wrist
    if (hand && wrist?.visible && watchFrame[side]) {
      // The joints are in the avatar's space, like the controller
      new THREE.Matrix4().copy(wrist.matrix)
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, WATCH_UP_ARM))
        .multiply(watchFrame[side].clone().invert())
        .decompose(controller.position, controller.quaternion, new THREE.Vector3())
    }
    else if (grip?.visible && !(hand && watchFrame[side])) {
      controller.position.copy(grip.position)
      controller.quaternion.copy(grip.quaternion)
    }
    // A tracked hand that is lost for a moment stays where it was
    controller.visible = !!hand || !!grip?.visible
    const model = controller.getObjectByName('hand')
    if (model) {
      model.visible = !hand
    }

    let clenched = false
    if (hand) {
      tracked.classify(hand)
      clenched = hand.clenched
    }
    if (clenched !== lastClenched[side]) {
      lastClenched[side] = clenched
      events.push({side, pressed: clenched})
    }
  }
  scene.updateMatrixWorld()
  trackedHands.forEach(tracked.draw)
  return events
}

export async function load () {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('hand.glb')
  const hand = gltf.scene
  hand.mixer = new THREE.AnimationMixer(hand)
  hand.scale.setScalar(0.11)
  hand.trigger = false
  hand.grab = false
  hand.t = 2
  hand.name = 'hand'
  const clip = gltf.animations[0]
  const action = hand.mixer.clipAction(clip)
  action.play()

  hand.bones = []
  hand.traverse(child => {
    if (child.isBone) {
      child.frames = []
      hand.bones.push(child)
    }
  })

  for (let i = 1; i <= 4; i++) {
    for (let bone of hand.bones) {
      hand.mixer.setTime(clip.duration * (i / 4) - 0.00001)
      hand.mixer.update(0)
      let position = bone.position.clone()
      let quaternion = bone.quaternion.clone()
      bone.frames.push({position, quaternion})
    }
  }

  hand.mixer.setTime(0)
  hand.mixer.update(0)

  hand.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true
    }
  })

  return hand
}

export function isPointing (side) {
  const tracking = trackedHand(side)
  if (tracking) {
    return tracking.pointing
  }
  const controller = avatar.controllers[side]
  const hand = controller.getObjectByName('hand')
  return !hand.trigger && hand.grab
}

export function getTipPosition (side) {
  const tracking = trackedHand(side)
  const tip = tracking && tracked.position(tracking, 'index-finger-tip')
  if (tip) {
    return tip
  }
  const controller = avatar.controllers[side]
  let position = new THREE.Vector3(0.01, -0.08, -0.07)
  if (side === 'left') {
    position.x *= -1
  }
  controller.localToWorld(position)
  return position
}

export function getPosition (side) {
  const wrist = trackedHand(side)?.source.joints.wrist
  if (wrist?.visible) {
    return wrist.localToWorld(GRAB_POINT.clone())
  }
  const controller = avatar.controllers[side]
  const position = new THREE.Vector3()
  controller.getWorldPosition(position)
  return position
}

export function getTransform (side) {
  const controller = avatar.controllers[side]
  let position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const rotation = new THREE.Euler()
  controller.getWorldPosition(position)
  controller.getWorldQuaternion(quaternion)
  rotation.setFromQuaternion(quaternion)
  return {position, rotation}
}

export function animate (side, button, pressed) {
  const controller = avatar.controllers[side]
  const hand = controller.getObjectByName('hand')
  if (button === 'trigger') {
    hand.trigger = pressed
    if (hand.grab) {
      hand.startPose = 2
      hand.endPose = 3
    }
    else {
      hand.startPose = 0
      hand.endPose = 1
    }
  }
  else if (button === 'grab') {
    hand.grab = pressed
    if (hand.trigger) {
      hand.startPose = 1
      hand.endPose = 3
    }
    else {
      hand.startPose = 0
      hand.endPose = 2
    }
  }

  if (!pressed) {
    [hand.startPose, hand.endPose] = [hand.endPose, hand.startPose]
  }

  hand.t = 0
}

function interpolate (hand, bone) {
  const startPose = hand.startPose
  const endPose = hand.endPose
  const startPosition = bone.frames[startPose].position
  const endPosition = bone.frames[endPose].position
  const startQuaternion = bone.frames[startPose].quaternion
  const endQuaternion = bone.frames[endPose].quaternion
  const interpolatedPosition = new THREE.Vector3()
  interpolatedPosition.lerpVectors(startPosition, endPosition, hand.t)
  const interpolatedQuaternion = new THREE.Quaternion()
  interpolatedQuaternion.slerpQuaternions(startQuaternion, endQuaternion, hand.t)
  bone.position.copy(interpolatedPosition)
  bone.quaternion.copy(interpolatedQuaternion)
}

export function update (side) {
  const controller = avatar.controllers[side]
  const hand = controller.getObjectByName('hand')
  if (hand.t < 1) {
    hand.t = util.within(hand.t + 0.1, 0, 1)
    hand.bones.forEach(bone => interpolate(hand, bone))
  }
}

// For tests: what a tracked hand's shape reads as
export function trackedState (side) {
  const hand = trackedHand(side)
  return hand && {clenched: hand.clenched, pointing: hand.pointing,
                  measure: tracked.measure(hand), lastClenched: lastClenched[side]}
}
