import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import * as util from './util.js'

export async function init () {
  window.state = {}

  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('calculator.glb')
  const calculator = gltf.scene.getObjectByName('calculator')
  let collision = calculator.getObjectByName('collision')
  collision.visible = false
  calculator.scale.setScalar(0.25)
  calculator.interactive = true
  scene.add(calculator)

  let button = calculator.getObjectByName('button-0')
  let box = button.children[0]
  box.visible = false

  const tip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
                              new THREE.MeshStandardMaterial({color: 'red'}))
  tip.position.set(-0.04, -0.07, -0.1)
  tip.scale.setScalar(0.01)
  tip.name = 'tip'

  const rightHand = scene.getObjectByName('right_controller')
  rightHand.add(tip)
  const leftHand = scene.getObjectByName('left_controller')
  const leftTip = tip.clone()
  leftTip.position.x *= -1
  leftHand.add(leftTip)

  const listener = new THREE.AudioListener()
  camera.add(listener)
  const audioLoader = new THREE.AudioLoader()
  const buffer = await audioLoader.loadAsync('button.ogg')
  const sound = new THREE.Audio(listener)
  sound.setBuffer(buffer)
  sound.setLoop(false)
  sound.setVolume(1)
  calculator.add(sound)
  calculator.buttonSound = sound
}

export function mousePressed (event) {}
export function mouseMoved (event) {}
export function mouseReleased (event) {}
export function keyPressed (event) {}
export function keyReleased (event) {}

export function buttonPressed (hand, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[hand]
    const otherHand = hand === "left" ? "right" : "left"
    const otherController = avatar.controllers[otherHand]
    const position = new THREE.Vector3()
    controller.getWorldPosition(position)
    const object = util.getObjectAt(position)

    if (object && object.interactive) {
      if (object.parent === otherController) {
        otherController.held = null
        otherController.remove(object)
      }

      controller.held = object
      controller.add(object)

      const relativeTransform =
            new THREE.Matrix4()
            .copy(controller.matrixWorld)
            .invert()
            .multiply(object.matrixWorld)

      relativeTransform.decompose(object.position,
                                  object.quaternion,
                                  object.scale)
      util.pulse(hand, 1, 50)
    }
  }
}

export function buttonReleased (hand, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[hand]
    const held = controller.held
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()

    if (held) {
      held.getWorldPosition(position)
      held.getWorldQuaternion(quaternion)
      scene.add(held)
      held.position.copy(position)
      held.quaternion.copy(quaternion)
    }
    controller.held = null
  }
}

function pressButton (hand, which) {
  let calculator = scene.getObjectByName('calculator')
  let button = calculator.getObjectByName(which)
  let box = button.children[0]

  let boxPosition = new THREE.Vector3()
  box.getWorldPosition(boxPosition)

  let controller = scene.getObjectByName(`${hand}_controller`)
  let tip = controller.getObjectByName('tip')

  let tipPosition = new THREE.Vector3()
  tip.getWorldPosition(tipPosition)

  if (tipPosition.distanceTo(boxPosition) < 0.1) {
    let oldZ = button.position.z
    if (util.isInsideObject(box, tipPosition)) {
      button.position.z += 0.02
    }
    else {
      button.position.z -= 0.02
    }

    let minZ = -0.54484
    let maxZ = -0.47
    let midZ = (minZ + maxZ) / 2

    button.position.z = util.within(button.position.z, minZ, maxZ)

    if (!button.pressed && button.position.z > midZ) {
      button.pressed = true
      util.pulse(hand, 0.5, 50)
      calculator.buttonSound.play()
    }
    else if (button.pressed && button.position.z < midZ) {
      button.pressed = false
    }
  }
}

export function update () {
  pressButton('right', 'button-0')
  pressButton('left', 'button-0')
}
