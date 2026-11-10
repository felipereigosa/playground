import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import * as util from '../util.js'
import * as player from '../player.js'
import * as hand from '../hand.js'
import * as grab from '../grab.js'

// One cube at a time, so its state can live in the module
let state = null

export async function create () {
  state = {twoHanded: {left: false, right: false}}

  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('cube/cube.glb')
  const cube = gltf.scene.children[0]

  cube.scale.setScalar(0.7)

  let collision = util.findChild(cube, 'collision')
  collision.visible = false

  cube.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true
    }
  })

  const rotator = new THREE.Group()
  cube.add(rotator)

  state.rotator = rotator
  state.cube = cube
  state.actions = []
  state.action = null

  for (let child of cube.children) {
    child.savedPosition = child.position.clone()
    child.savedRotation = child.rotation.clone()
  }
  state.scrambled = false

  await player.load('cube/clack.ogg')
  return cube
}

export function dispose () {
  state = null
}

function getFaceParts (direction) {
  let result = []
  for (let child of state.cube.children) {
    if(child.position.dot(direction) > 0.1) {
      result.push(child)
    }
  }
  return result
}

function getHandsFaceDirection () {
  const leftPosition = hand.getPosition('left')
  const rightPosition = hand.getPosition('right')

  state.cube.worldToLocal(leftPosition)
  state.cube.worldToLocal(rightPosition)

  const center = new THREE.Vector3()
  center.addVectors(leftPosition, rightPosition)
  center.divideScalar(2)

  return util.axisAlignedVector(center)
}

function startRotation (direction) {
  const parts = getFaceParts(direction)
  state.rotator.rotation.set(0, 0, 0)
  state.rotator.direction = direction
  parts.forEach(part => state.rotator.add(part))
  state.scrambled = true
}

function setAngle (angle) {
  state.rotator.angle = angle
  const rotation = new THREE.Vector3().copy(state.rotator.direction)
  rotation.multiplyScalar(util.toRadians(angle))
  state.rotator.rotation.setFromVector3(rotation)
  state.rotator.updateMatrixWorld()
}

function endRotation () {
  for (let part of [...state.rotator.children]) {
    util.transferChild(part, state.rotator, state.cube)
  }
  player.play('clack')
}

function toggleScramble () {
  if (!state.action && state.actions.length === 0) {
    if (state.scrambled) {
      for (let child of state.cube.children) {
        if (child !== state.rotator) {
          child.position.copy(child.savedPosition)
          child.rotation.copy(child.savedRotation)
        }
      }
      state.scrambled = false
    }
    else {
      while (state.actions.length < 10) {
        const sign = Math.random() > 0.5 ? 1 : -1
        const axis = Math.floor(Math.random() * 3)
        const sign2 = Math.random() > 0.5 ? 1 : -1
        const direction = new THREE.Vector3(axis === 0 ? sign2 : 0,
                                            axis === 1 ? sign2 : 0,
                                            axis === 2 ? sign2 : 0)
        const lastAction = state.actions[state.actions.length - 1]
        if (!lastAction ||
            !(lastAction.direction.dot(direction) === 1 &&
              lastAction.sign !== sign)) {
          state.actions.push({direction,
                              startAngle: 0,
                              endAngle: sign * 90,
                              rotateCube: true})
        }
      }
    }
  }
}

function startHandRotation () {
  state.startLeft = hand.getPosition('left')
  state.startRight = hand.getPosition('right')
  state.endLeft = new THREE.Vector3()
  state.endRight = new THREE.Vector3()
  state.twoHanded.left = true
  state.twoHanded.right = true
  startRotation(getHandsFaceDirection())
}

function setHandAngle () {
  state.endLeft = hand.getPosition('left')
  state.endRight = hand.getPosition('right')
  const startV = new THREE.Vector3().subVectors(state.startRight, state.startLeft)
  const endV = new THREE.Vector3().subVectors(state.endRight, state.endLeft)
  const axis = state.rotator.direction.clone()
  axis.applyQuaternion(state.cube.quaternion)
  const angle = util.signedAngle(startV, endV, axis)
  setAngle(angle)
}

function endHandRotation () {
  let startAngle = state.rotator.angle
  let sign = Math.sign(startAngle)
  let endAngle = Math.round(Math.abs(startAngle) / 90) * 90 * sign

  state.action = {direction: state.rotator.direction,
                  startAngle: state.rotator.angle,
                  endAngle: endAngle}
}

// Picking up the cube is done by grab.js. Grabbing with the free hand while
// the other holds it leaves the cube floating where it is and turns the face
// between the hands as they move, until both let go.
export function grabPressed (side) {
  const holder = grab.other(side)
  if (grab.heldIn(holder)?.root !== state.cube) {
    return false
  }
  grab.dropKeepingGrab(holder)
  util.pulse(side, 1, 50)
  startHandRotation()
  return true
}

export function grabReleased (side) {
  if (state.twoHanded[side] && !state.twoHanded[grab.other(side)]) {
    endHandRotation()
  }
  state.twoHanded[side] = false
}

export function buttonPressed (side, button) {
  if (button === 'trigger') {
    toggleScramble()
  }
}

function startAction () {
  state.action = state.actions.shift()
  let direction = state.action.direction
  state.rotator.angle = state.action.startAngle
  startRotation(direction)
}

function updateAction () {
  const startAngle = state.action.startAngle
  const endAngle = state.action.endAngle

  const sign = startAngle > endAngle ? -1 : 1

  setAngle(state.rotator.angle + 4 * sign)
  if ((sign === 1 && state.rotator.angle > endAngle) ||
      (sign === -1 && state.rotator.angle < endAngle)) {
    setAngle(endAngle)
    endRotation()
    state.action = null
  }
}

export function update () {
  if (state.action) {
    if (state.action.rotateCube) {
      ['x', 'y', 'z'].forEach(axis => state.cube.rotation[axis] += 0.01)
    }
    updateAction()
  }
  else if (state.actions.length > 0) {
    startAction()
  }
  else if (state.rotator.children.length === 9) {
    setHandAngle()
  }
}
