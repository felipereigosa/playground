import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import * as util from '../util.js'
import * as player from '../player.js'
import * as hand from '../hand.js'

// One tiles box at a time, so its state can live in the module
let state = null

export async function create () {
  state = {moving: {left: null, right: null}}

  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('tiles/tiles.glb')
  const box = gltf.scene.getObjectByName('box')
  let collision = box.getObjectByName('collision')
  collision.visible = false
  box.scale.setScalar(0.5)
  state.box = box
  box.getObjectByName('case').castShadow = true

  box.traverse(child => {
    if (child.isMesh &&
        !child.name.startsWith('collision')) {
      child.receiveShadow = true
    }
  })

  for (let i = 0; i < 11; i++) {
    let number = i > 9 ? '' + i : '0' + i
    let name = 'tile_' + number

    let tile = box.getObjectByName(name)
    let collision = util.findChild(tile, 'collision')
    collision.visible = false
  }

  await player.load('tiles/knock.ogg')
  return box
}

export function dispose () {
  state = null
}

function getFreePoint () {
  let box = state.box
  for (let x of [-0.386191, -0.128730, 0.128730, 0.386191]) {
    for (let z of [-0.263768, 0, 0.263768]) {
      let point = new THREE.Vector3(x, 0.15, z)
      box.localToWorld(point)

      if (!util.getObjectAt(point)) {
        return new THREE.Vector3(x, 0.069503, z)
      }
    }
  }
}

// Picking up the box itself is done by grab.js; this slides a tile next to
// the hole
export function grabPressed (side, hit) {
  if (!hit?.name.startsWith('tile_')) {
    return false
  }
  let start = hit.position.clone()
  let end = getFreePoint()
  if (start.distanceTo(end) < 0.3) {
    state.moving[side] = {which: hit, start, end, snap: 'start'}
  }
  return true
}

function snapped (side) {
  util.pulse(side, 1, 50)
  player.play('knock')
}

export function grabReleased (side) {
  const movingTile = state.moving[side]
  if (movingTile) {
    const tile = movingTile.which
    let startDistance = tile.position.distanceTo(movingTile.start)
    let endDistance = tile.position.distanceTo(movingTile.end)

    if (startDistance > 0 && endDistance > 0) {
      snapped(side)
    }

    if (startDistance < endDistance) {
      tile.position.copy(movingTile.start)
    }
    else {
      tile.position.copy(movingTile.end)
    }
  }
  state.moving[side] = null
}

function updateTile (side) {
  let box = state.box
  let movingTile = state.moving[side]

  if (movingTile) {
    let position = hand.getPosition(side)
    box.worldToLocal(position)
    let point = util.closestPointOnLine(movingTile.start, movingTile.end, position)

    if (point.distanceTo(movingTile.start) < 0.015 &&
        movingTile.snap !== 'start') {
      movingTile.snap = 'start'
      snapped(side)
    }

    if (point.distanceTo(movingTile.end) < 0.015 &&
        movingTile.snap !== 'end') {
      movingTile.snap = 'end'
      snapped(side)
    }

    movingTile.which.position.copy(point)
  }
}

export function update () {
  updateTile('right')
  updateTile('left')
}
