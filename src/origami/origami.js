// import * as THREE from 'three'
// import * as util from './util.js'

// export function mousePressed (event) {}
// export function mouseMoved (event) {}
// export function mouseReleased (event) {}
// export function update () {}

// function pointInsideSegment (p, q1, q2) {
//   const v = new THREE.Vector3().subVectors(q2, q1)
//   const u = new THREE.Vector3().subVectors(p, q1)
//   const dot = v.dot(u)
//   const len = v.lengthSq()
//   return 0 <= dot && dot <= len
// }

// function lineLineIntersection(line1, line2) {
//   const [p1, p2] = line1
//   const [p3, p4] = line2

//   const a1 = p2.z - p1.z
//   const b1 = p1.x - p2.x
//   const c1 = a1 * p1.x + b1 * p1.z

//   const a2 = p4.z - p3.z
//   const b2 = p3.x - p4.x
//   const c2 = a2 * p3.x + b2 * p3.z

//   const determinant = a1 * b2 - a2 * b1

//   if (determinant === 0) {
//     return null
//   }

//   const x = (b2 * c1 - b1 * c2) / determinant
//   const z = (a1 * c2 - a2 * c1) / determinant
//   let point = new THREE.Vector3(x, 0, z)

//   if (pointInsideSegment(point, p3, p4)) {
//     return point
//   }
//   else {
//     return null
//   }
// }

// function lineTriangleIntersection (line, triangle) {
//   const intersections = []

//   for (let i = 0; i < 3; i++) {
//     const j = (i + 1) % 3
//     const q1 = triangle.points[i]
//     const q2 = triangle.points[j]
//     intersections.push(lineLineIntersection(line, [q1, q2]))
//   }
//   return intersections
// }

// function splitTriangles (triangles, line) {
//   let result = []

//   for (let triangle of triangles) {
//     let intersections = lineTriangleIntersection(line, triangle)
//     let index = intersections.findIndex(i => i === null)

//     if (intersections.every(i => i === null)) {
//       result.push(triangle)
//       continue
//     }

//     while (intersections[0] !== null) {
//       intersections.push(intersections.shift())
//       triangle.points.push(triangle.points.shift())
//     }

//     let intersection
//     if (pointInsideSegment(intersections[1],
//                            triangle.points[1],
//                            triangle.points[2])) {
//       intersection = intersections[1]
//     }
//     else {
//       intersection = intersections[2]
//     }

//     result.push({points: [intersections[1], intersections[2], triangle.points[2]]})
//     result.push({points: [intersections[1], intersections[2], triangle.points[0]]})
//     result.push({points: [intersection, triangle.points[0], triangle.points[1]]})
//   }

//   return result
// }

// function createCylinder(a, b, radius) {
//   const direction = new THREE.Vector3().subVectors(b, a)
//   const length = direction.length()
//   const geometry = new THREE.CylinderGeometry(radius, radius, length, 32)
//   const midPoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
//   const material = new THREE.MeshStandardMaterial({color: 'white'})
//   const cylinder = new THREE.Mesh(geometry, material)
//   const orientation = new THREE.Matrix4()
//   orientation.lookAt(a, b, new THREE.Vector3(0, 1, 0))
//   const rotation = new THREE.Matrix4()
//   rotation.makeRotationX(Math.PI / 2)
//   orientation.multiply(rotation)
//   cylinder.applyMatrix4(orientation)
//   cylinder.position.copy(midPoint)
//   return cylinder
// }

// function rotatePoint (point, line, angle) {
//   let pivot = line[0]
//   let axis = new THREE.Vector3().subVectors(line[1], line[0]).normalize()
//   let v = new THREE.Vector3().subVectors(point, pivot)
//   let matrix = new THREE.Matrix4().makeRotationAxis(axis, angle)
//   v.applyMatrix4(matrix)
//   return v.add(pivot)
// }

// function rotateTriangle (triangle, line, angle) {
//   const newTriangle = {points: []}

//   for (let point of triangle.points) {
//     newTriangle.points.push(rotatePoint(point, line, angle))
//   }

//   return newTriangle
// }

// function isToTheLeft (triangle, line) {
//   const [a, b, c] = triangle.points
//   const center = new THREE.Vector3()
//         .addVectors(a, b)
//         .add(c)
//         .multiplyScalar(1 / 3)
//   const [p, q] = line
//   const v1 = new THREE.Vector3().subVectors(q, p)
//   const up = new THREE.Vector3(0, 1, 0)
//   const v2 = new THREE.Vector3().subVectors(center, p)
//   const cross = new THREE.Vector3().crossVectors(v1, v2)
//   return cross.dot(up) > 0
// }

// function groupTriangles (triangles, lines) {
//   if (lines.length === 0) {
//     return [triangles]
//   }
//   else {
//     let line = lines[0]
//     let left = []
//     let right = []

//     for (let triangle of triangles) {
//       if (isToTheLeft(triangle, line)) {
//         left.push(triangle)
//       }
//       else {
//         right.push(triangle)
//       }
//     }
//     const others = groupTriangles(right, lines.slice(1))
//     others.push(left)
//     return others
//   }
// }

// function addLine (lines, distance) {
//   const lastLine = lines[lines.length - 1]
//   const [p, q] = lastLine
//   const direction = new THREE.Vector3().subVectors(q, p)
//   const perpedicular = new THREE.Vector3(-direction.z, 0, direction.x)
//         .normalize()
//         .multiplyScalar(distance)
//   const a = new THREE.Vector3().addVectors(p, perpedicular)
//   const b = new THREE.Vector3().addVectors(q, perpedicular)
//   lines.push([a, b])
// }

// export async function init () {
//   let triangles = [
//     {points: [new THREE.Vector3(0, 0, 0),
//               new THREE.Vector3(0, 0, 1),
//               new THREE.Vector3(1, 0, 0)],
//     },
//     {points: [new THREE.Vector3(1, 0, 1),
//               new THREE.Vector3(1, 0, 0),
//               new THREE.Vector3(0, 0, 1)],
//     },
//   ]

//   let lines = [[new THREE.Vector3(-0.5, 0, 0.55),
//                 new THREE.Vector3(1.5, 0, 0.05)]]

//   for (let i = 0; i < 20; i++) {
//     addLine(lines, 0.02)
//   }

//   for (let line of lines) {
//     triangles = splitTriangles(triangles, line)
//     // const cylinder = createCylinder(line[0], line[1], 0.005)
//     // scene.add(cylinder)
//   }

//   let groups = groupTriangles(triangles, lines).reverse()
//   const angle = util.toRadians(8)

//   for (let i = 0; i < lines.length; i++) {
//     for (let j = 0; j <= i; j++) {
//       groups[j] = groups[j].map(triangle => rotateTriangle(triangle, lines[i], angle))
//     }
//   }

//   for (let triangles of groups) {
//     const color = new THREE.Color(Math.random(), Math.random(), Math.random())
//     // const color = new THREE.Color('red')
//     let geometry = new THREE.BufferGeometry()
//     const vertices = new Float32Array(triangles.map(triangle => triangle.points)
//                                       .flat()
//                                       .map(point => point.toArray())
//                                       .flat())

//     geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))

//     const colors = new Float32Array(vertices.length)
//     for (let i = 0; i < colors.length; i += 9) {
//       for (let j = 0; j < 3; j++) {
//         colors[i + j * 3] = color.r
//         colors[i + j * 3 + 1] = color.g
//         colors[i + j * 3 + 2] = color.b
//       }
//     }

//     geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

//     const material = new THREE.MeshStandardMaterial({
//       vertexColors: true,
//       side: THREE.DoubleSide,
//     })

//     geometry.computeVertexNormals()

//     const object = new THREE.Mesh(geometry, material)
//     scene.add(object)
//   }
// }

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import * as util from '../util.js'
import * as player from '../player.js'
import * as hand from '../hand.js'

export async function init () {
  window.state = {}

  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('cube/cube.glb')
  const cube = gltf.scene.children[0]

  cube.position.set(0, 1, 0)
  cube.scale.setScalar(0.7)
  scene.add(cube)

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
  const cube = state.cube
  state.savedTransform.decompose(cube.position, cube.quaternion, cube.scale)
  state.startLeft = hand.getPosition('left')
  state.startRight = hand.getPosition('right')
  state.endLeft = new THREE.Vector3()
  state.endRight = new THREE.Vector3()
  avatar.controllers.left.twoHanded = true
  avatar.controllers.right.twoHanded = true
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

export function buttonPressed (side, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[side]
    const otherSide = side === 'left' ? 'right' : 'left'
    const otherController = avatar.controllers[otherSide]
    let object

    if (otherController.held) {
      util.transferChild(otherController.held, otherController, scene)
      otherController.held = null
      util.pulse(side, 1, 50)
      startHandRotation()
    }
    else if (object = util.getObjectAt(hand.getPosition(side))) {
      state.savedTransform = object.matrixWorld.clone()

      if (object.parent === otherController) {
        otherController.held = null
        otherController.remove(object)
      }
      controller.held = object
      util.transferChild(object, scene, controller)
      util.pulse(side, 1, 50)
    }
  }
  else if (button === 'trigger') {
    toggleScramble()
  }
}

export function buttonReleased (side, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[side]
    const otherSide = side === 'left' ? 'right' : 'left'
    const otherController = avatar.controllers[otherSide]

    if (controller.held) {
      util.transferChild(controller.held, controller, scene)
      controller.held = null
    }
    else if (controller.twoHanded && !otherController.twoHanded) {
      endHandRotation()
    }
    controller.twoHanded = false
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
