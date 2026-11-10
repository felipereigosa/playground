import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import * as util from '../util.js'
import * as player from '../player.js'
import * as hand from '../hand.js'

export async function init () {
  window.state = {}

  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('tiles/tiles.glb')
  const box = gltf.scene.getObjectByName('box')
  let collision = box.getObjectByName('collision')
  collision.visible = false
  box.scale.setScalar(0.5)
  box.interactive = true
  scene.add(box)
  box.position.set(0, 0.5, 0)
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
}

function getFreePoint () {
  let box = scene.getObjectByName('box')
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

export function buttonPressed (side, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[side]
    const otherSide = side === 'left' ? 'right' : 'left'
    const otherController = avatar.controllers[otherSide]
    const object = util.getObjectAt(hand.getPosition(side))

    if (object) {
      if (object.interactive) {
        if (object.parent === otherController) {
          otherController.held = null
          otherController.remove(object)
        }

        controller.held = object
        util.transferChild(object, scene, controller)
        util.pulse(side, 1, 50)
      }
      else {
        let start = object.position.clone()
        let end = getFreePoint()
        let distance = start.distanceTo(end)

        if (distance < 0.3) {
          controller.movingTile = {which: object,
                                   start: object.position.clone(),
                                   end: getFreePoint(),
                                   snap: 'start'}
        }
      }
    }
  }
}

function snapped (side) {
  util.pulse(side, 1, 50)
  player.play('knock')
}

export function buttonReleased (side, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[side]
    if (controller.held) {
      util.transferChild(controller.held, controller, scene)
      controller.held = null
    }

    if (controller.movingTile) {
      const tile = controller.movingTile.which
      let startDistance = tile.position.distanceTo(controller.movingTile.start)
      let endDistance = tile.position.distanceTo(controller.movingTile.end)

      if (startDistance > 0 && endDistance > 0) {
        snapped(side)
      }

      if (startDistance < endDistance) {
        tile.position.copy(controller.movingTile.start)
      }
      else {
        tile.position.copy(controller.movingTile.end)
      }
    }
    controller.movingTile = null
  }
}

function updateTile (side) {
  let box = scene.getObjectByName('box')
  let movingTile = avatar.controllers[side].movingTile

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
