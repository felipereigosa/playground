import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from './util.js'

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
  const controller = avatar.controllers[side]
  const hand = controller.getObjectByName('hand')
  return !hand.trigger && hand.grab
}

export function getTipPosition (side) {
  const controller = avatar.controllers[side]
  let position = new THREE.Vector3(0.01, -0.08, -0.07)
  if (side === 'left') {
    position.x *= -1
  }
  controller.localToWorld(position)
  return position
}

export function getPosition (side) {
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
