import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { threeToCannon, ShapeType } from 'three-to-cannon'
import * as util from '../util.js'
import * as hits from '../hits.js'
import * as physics from '../physics.js'

// Giant bricks, from the BrickFusion project: a set whose icon is a model of
// its own (icon.glb).
// Let go, it lays the bricks of the car out on the floor around that spot.
// A brick (or several stuck together: a group) is carried by hand and thrown;
// let go with a peg near a matching hole it snaps on; held in one hand, a
// brick of it pulled by the other comes off with whatever hangs on it. They
// fall and tumble (physics.js) and are knocked about by shots (hits.js).
// Stowing remembers the build, also across reloads, and deploying lays it
// out again as it was, around the new spot; ?lego=new starts over.
//
// car.glb has the bricks where they start, named <part>.00n; parts.glb has
// each part's collision mesh and its pegs and holes (peg_<kind>_, hole_<kind>_).

const NAME = 'lego'
const LEFT_OUT = /^instructions/   // bricks of car.glb that are not used
const SAVED = 'playground.lego'
const SNAP = 0.05           // metres between a peg and a hole that join
const THROW = 120           // hand speed (per frame) to metres per second
const KNOCK = 30            // how hard a shot pushes
const MARGIN = 0.5          // bricks are laid out this far inside them

let state = null

export async function create () {
  const loader = new GLTFLoader()
  const [parts, car, icon] = await Promise.all(
    ['lego/parts.glb', 'lego/car.glb', 'lego/icon.glb'].map(file => loader.loadAsync(file)))
  car.scene.updateMatrixWorld(true)
  parts.scene.updateMatrixWorld(true)
  state = {parts: parts.scene, car: car.scene, groups: [],
           held: {left: null, right: null}, frame: new THREE.Matrix4()}
  if (new URLSearchParams(location.search).get('lego') === 'new') {
    localStorage.removeItem(SAVED)
  }
  // The icon, with a box around it to be picked up by
  const root = icon.scene
  root.userData.icon = true
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const collision = new THREE.Mesh(
    new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()),
    new THREE.MeshBasicMaterial())
  collision.name = 'collision'
  collision.position.copy(box.getCenter(new THREE.Vector3()))
  collision.visible = false
  root.add(collision)
  return root
}

// A brick of the car with its part's collision mesh, pegs and holes
function makePiece (name) {
  const piece = state.car.getObjectByName(name).clone()
  if (piece.children[0]) {
    piece.children[0].renderOrder = 1
  }
  const part = state.parts.getObjectByName(name.substring(0, name.length - 3))
  for (const child of part.children) {
    piece.add(child.clone())
  }
  piece.collision = piece.children.find(child => child.name.startsWith('collision'))
  piece.collision.visible = false
  piece.castShadow = true
  piece.userData.brick = name
  return piece
}

function makeGroup () {
  const group = new THREE.Group()
  group.userData.gadget = NAME
  state.groups.push(group)
  hits.add(group, shot => knocked(group, shot))
  return group
}

function removeGroup (group) {
  if (group.body) {
    physics.world.removeBody(group.body)
  }
  hits.remove(group)
  group.removeFromParent()
  state.groups = state.groups.filter(other => other !== group)
}

// Around the spot on the floor under `position`, the bricks' -z along
// `facing`: the build stowed last, or the car's bricks as they start
export function deploy (position, facing) {
  state.frame.compose(
    new THREE.Vector3(position.x, 0, position.z),
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), Math.atan2(-facing.x, -facing.z)),
    new THREE.Vector3(1, 1, 1))
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(SAVED))
  }
  catch (error) {
  }
  saved ??= state.car.children.filter(piece => !LEFT_OUT.test(piece.name)).map(piece => ({
    matrix: piece.matrix.toArray(),
    pieces: [{brick: piece.name, matrix: new THREE.Matrix4().toArray()}],
  }))
  // The spot moves as far as it takes for all of them to land inside the
  // walls (to the middle, along a side they don't fit in)
  const box = new THREE.Box3()
  for (const entry of saved) {
    box.expandByPoint(new THREE.Vector3()
      .setFromMatrixPosition(new THREE.Matrix4().fromArray(entry.matrix)).applyMatrix4(state.frame))
  }
  const inside = physics.ROOM - MARGIN
  const shift = axis => box.max[axis] - box.min[axis] > 2 * inside
    ? -(box.max[axis] + box.min[axis]) / 2
    : Math.max(-inside - box.min[axis], 0) + Math.min(inside - box.max[axis], 0)
  state.frame.premultiply(new THREE.Matrix4().makeTranslation(shift('x'), 0, shift('z')))
  for (const entry of saved) {
    if (entry.pieces.every(piece => LEFT_OUT.test(piece.brick))) {
      continue
    }
    const group = makeGroup()
    state.frame.clone().multiply(new THREE.Matrix4().fromArray(entry.matrix))
      .decompose(group.position, group.quaternion, group.scale)
    for (const {brick, matrix} of entry.pieces.filter(piece => !LEFT_OUT.test(piece.brick))) {
      const piece = makePiece(brick)
      new THREE.Matrix4().fromArray(matrix)
        .decompose(piece.position, piece.quaternion, piece.scale)
      group.add(piece)
    }
    scene.add(group)
    createBody(group)
  }
}

export function parts () {
  return state.groups
}

// Remembers every group's place from the spot it was deployed around
export function stow () {
  scene.updateMatrixWorld(true)
  const inverse = state.frame.clone().invert()
  const saved = state.groups.map(group => ({
    matrix: inverse.clone().multiply(group.matrixWorld).toArray(),
    pieces: group.children.map(piece => ({
      brick: piece.userData.brick,
      matrix: piece.matrix.toArray(),
    })),
  }))
  localStorage.setItem(SAVED, JSON.stringify(saved))
  clear()
}

function clear () {
  for (const group of [...state.groups]) {
    removeGroup(group)
  }
  state.held = {left: null, right: null}
}

export function dispose () {
  clear()
  state = null
}

// Puts the group's origin in the middle of its bricks
function recenterGroup (group) {
  const children = [...group.children]
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  for (const child of children) {
    child.getWorldPosition(position)
    child.getWorldQuaternion(quaternion)
    scene.add(child)
    child.position.copy(position)
    child.quaternion.copy(quaternion)
  }
  const center = new THREE.Vector3()
  children.forEach(child => center.add(child.position))
  center.divideScalar(children.length)
  group.position.copy(center)
  group.rotation.set(0, 0, 0)
  for (const child of children) {
    group.add(child)
    child.position.sub(center)
  }
}

// The group's body, asleep where the group is: the hulls of its bricks
function createBody (group) {
  if (group.body) {
    physics.world.removeBody(group.body)
  }
  scene.updateMatrixWorld(true)
  recenterGroup(group)
  const body = new CANNON.Body({mass: 10})
  for (const piece of group.children) {
    const result = threeToCannon(piece.collision, {type: ShapeType.HULL})
    const p = piece.position
    const r = piece.rotation
    body.addShape(result.shape, new CANNON.Vec3(p.x, p.y, p.z),
      new CANNON.Quaternion().setFromEuler(r.x, r.y, r.z))
  }
  body.position.copy(group.position)
  body.quaternion.copy(group.quaternion)
  body.allowSleep = true
  body.sleep()
  body.sleepSpeedLimit = 1
  physics.world.addBody(body)
  group.body = body
}

function knocked (group, {point, direction}) {
  if (!group.body || Object.values(state.held).includes(group)) {
    return
  }
  group.body.wakeUp()
  group.body.applyImpulse(
    new CANNON.Vec3(direction.x * KNOCK, direction.y * KNOCK, direction.z * KNOCK),
    new CANNON.Vec3(point.x - group.body.position.x, point.y - group.body.position.y,
      point.z - group.body.position.z))
}

function getPieceAt (position) {
  for (const group of state.groups) {
    for (const piece of group.children) {
      if (util.isInsideObject(piece.collision, position)) {
        return piece
      }
    }
  }
  return null
}

function snapsMatch (a, b) {
  const [aKind, aSize] = a.name.split('_')
  const [bKind, bSize] = b.name.split('_')
  return ((aKind === 'peg' && bKind === 'hole') || (aKind === 'hole' && bKind === 'peg')) &&
    aSize === bSize
}

function piecesConnected (a, b) {
  const aPosition = new THREE.Vector3()
  const bPosition = new THREE.Vector3()
  for (const aChild of a.children) {
    for (const bChild of b.children) {
      if (snapsMatch(aChild, bChild) &&
          aChild.getWorldPosition(aPosition).distanceTo(bChild.getWorldPosition(bPosition)) < SNAP) {
        return true
      }
    }
  }
  return false
}

// The bricks of a group that come away with `piece` when it is pulled off
// while `otherPiece` is held: those not joined to otherPiece except through
// piece
function getMovingPieces (group, piece, otherPiece) {
  const staying = new Set([otherPiece])
  const queue = [otherPiece]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const child of group.children) {
      if (child !== piece && !staying.has(child) && piecesConnected(current, child)) {
        staying.add(child)
        queue.push(child)
      }
    }
  }
  return group.children.filter(child => !staying.has(child))
}

export function grabPressed (side, hit) {
  const controller = avatar.controllers[side]
  const otherSide = side === 'left' ? 'right' : 'left'
  const otherController = avatar.controllers[otherSide]
  const position = controller.getWorldPosition(new THREE.Vector3())
  const piece = getPieceAt(position)
  let group = piece?.parent
  if (!group) {
    return false
  }
  scene.updateMatrixWorld(true)
  controller.velocityEstimator.setPosition(position)
  if (group.parent === otherController) {
    const otherPiece = getPieceAt(otherController.getWorldPosition(new THREE.Vector3()))
    if (otherPiece && otherPiece.parent === group && piece !== otherPiece) {
      // Pulled off the group in the other hand
      const moving = getMovingPieces(group, piece, otherPiece)
      const newGroup = makeGroup()
      otherController.add(newGroup)
      newGroup.position.copy(group.position)
      newGroup.quaternion.copy(group.quaternion)
      for (const child of moving) {
        newGroup.add(child)
      }
      group = newGroup
    }
    else {
      state.held[otherSide] = null
    }
  }
  util.transferChild(group, group.parent, controller)
  state.held[side] = group
  util.pulse(side, 1, 50)
  return true
}

function canSnap (a, b) {
  if (!snapsMatch(a, b)) {
    return false
  }
  const aPosition = a.getWorldPosition(new THREE.Vector3())
  const bPosition = b.getWorldPosition(new THREE.Vector3())
  if (aPosition.distanceTo(bPosition) >= SNAP) {
    return false
  }
  const v1 = new THREE.Vector3(1, 0, 0).applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()))
  const v2 = new THREE.Vector3(1, 0, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()))
  return util.toDegrees(v1.angleTo(v2)) < 20
}

function getClosestTransform (q, transforms) {
  const closeness = transform => {
    const q2 = new THREE.Quaternion()
    util.getQuaternion(transform, q2)
    return Math.abs(q.dot(q2))
  }
  return transforms.sort((a, b) => closeness(b) - closeness(a))[0]
}

// Where the group would sit on another one that a peg or hole of it is
// about to join: the quarter turn about the peg nearest to how it is held
function getSnapTransform (group) {
  for (const otherGroup of state.groups) {
    if (otherGroup === group) continue
    for (const otherChild of otherGroup.children) {
      for (const a of otherChild.children) {
        for (const child of group.children) {
          for (const b of child.children) {
            if (!canSnap(a, b)) continue
            const transforms = []
            for (let angle = 0; angle < 360; angle += 90) {
              const transform = new THREE.Matrix4()
              transform.multiply(otherChild.matrix)
              transform.multiply(a.matrix)
              transform.multiply(new THREE.Matrix4().makeRotationFromQuaternion(
                util.aa2q([1, 0, 0, angle])))
              transform.multiply(b.matrix.clone().invert())
              transform.multiply(child.matrix.clone().invert())
              transforms.push(transform)
            }
            const q = otherGroup.getWorldQuaternion(new THREE.Quaternion()).invert()
              .multiply(group.getWorldQuaternion(new THREE.Quaternion()))
            return {transform: getClosestTransform(q, transforms), group: otherGroup}
          }
        }
      }
    }
  }
  return null
}

// The bricks of a move into b, placed by the transform
function weldJoin (a, b, transform) {
  for (const child of [...a.children]) {
    b.add(child)
    child.matrix.premultiply(transform)
    child.matrix.decompose(child.position, child.quaternion, child.scale)
  }
  removeGroup(a)
  // One still lying about gets a body with the new bricks
  if (b.parent === scene) {
    createBody(b)
  }
}

export function grabReleased (side) {
  const controller = avatar.controllers[side]
  const held = state.held[side]
  state.held[side] = null
  if (!held || held.parent !== controller) {
    return
  }
  scene.updateMatrixWorld(true)
  const snap = getSnapTransform(held)
  if (snap) {
    weldJoin(held, snap.group, snap.transform)
    util.pulse(side, 1, 50)
    return
  }
  util.transferChild(held, controller, scene)
  createBody(held)
  const velocity = new THREE.Vector3(...controller.velocityEstimator.getVelocity())
    .multiplyScalar(THROW)
  held.body.velocity.set(velocity.x, velocity.y, velocity.z)
  held.body.angularVelocity.set(0, 0, 0)
  held.body.wakeUp()
}

const _position = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()

export function update () {
  for (const group of state.groups) {
    if (!group.body) {
      continue
    }
    if (group.parent !== scene) {
      // In a hand: the body goes along
      group.getWorldPosition(_position)
      group.getWorldQuaternion(_quaternion)
      group.parent.velocityEstimator?.recordPosition(_position)
      group.body.position.copy(_position)
      group.body.quaternion.copy(_quaternion)
    }
    else {
      // One that got out of the room drops back in where the set was
      // deployed
      const at = group.body.position
      if (at.y < -1 || Math.abs(at.x) > physics.ROOM || Math.abs(at.z) > physics.ROOM) {
        _position.setFromMatrixPosition(state.frame)
        group.body.position.set(_position.x, 1.5, _position.z)
        group.body.wakeUp()
        group.body.velocity.set(0, 0, 0)
        group.body.angularVelocity.set(0, 0, 0)
      }
      group.position.copy(group.body.position)
      group.quaternion.copy(group.body.quaternion)
    }
  }
}
