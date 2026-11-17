import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import * as util from '../util.js'
import * as player from '../player.js'
import * as hand from '../hand.js'
import { characterMap } from './character_map.js'

// One calculator at a time, so its state can live in the module
let state = null

// On a surface it lies on its back, the top edge raised to face whoever
// put it there (world.js)
export const rest = {up: [0, 1, 0], top: [0, 0, -1], tilt: 20}

export async function create () {
  state = {}

  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('calculator/calculator.glb')
  const base = gltf.scene.getObjectByName('base')
  state.base = base
  base.scale.setScalar(0.16)
  base.rotation.x = util.toRadians(30)
  base.castShadow = true

  util.hideCollisionMeshes(base)

  base.traverse(child => {
    if (child.isMesh &&
        !child.name.startsWith('collision')) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  state.buttonNames = ['left' , 'clear', 'right',
                       'open', 'close', 'delete', 'divide',
                       '7', '8', '9', 'multiply',
                       '4', '5', '6', 'subtract',
                       '1', '2', '3', 'add',
                       '0', 'dot', 'equals']

  state.lid = base.getObjectByName('lid')

  state.display = base.getObjectByName('display')
  state.display.offColor = new THREE.Color(0, 0.01, 0.01)
  state.display.backgroundColor = new THREE.Color(0, 0.1, 0.1)
  state.display.hiddenColor = new THREE.Color(0, 0.08, 0.08)
  state.display.visibleColor = new THREE.Color(0, 0.005, 0.005)
  state.inputText = '|'
  state.outputText = ''

  state.lastTimePress = new Date().getTime()
  state.cursorOn = true

  updateCursor()
  state.cursorTimer = setInterval(updateCursor, 500)
  turnOffDisplay()

  await player.load('calculator/button.ogg')
  return base
}

export function dispose () {
  clearInterval(state.cursorTimer)
  state.display.material.map?.dispose()
  state = null
}

function getTime () {
  return new Date().getTime() - state.lastTimePress
}

function updateCursor () {
  if (state.on && getTime() > 500) {
    state.cursorOn = !state.cursorOn
    updateDisplay()
  }
}

function turnOffDisplay () {
  const color = state.display.offColor
  const texture = state.display.material.map
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = texture.image.width
  canvas.height = texture.image.height
  context.fillStyle = color.getStyle()
  context.fillRect(0, 0, canvas.width, canvas.height)
  state.display.material.map?.dispose()
  state.display.material.map = new THREE.CanvasTexture(canvas)
  state.display.material.needsUpdate = true
  state.on = false
}

function updateDisplay () {
  const texture = state.display.material.map
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = texture.image.width
  canvas.height = texture.image.height
  context.fillStyle = state.display.backgroundColor.getStyle()
  context.fillRect(0, 0, canvas.width, canvas.height)

  let index = state.inputText.indexOf('|') - 1
  let input = state.inputText.padEnd(11, ' ').replace('|', '')
  let output = state.outputText.padStart(10, ' ')
  let texts = [input, output]

  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 10; i++) {
      let size = 15
      let xOffset = 230
      let yOffset = 60
      let padding = 1

      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 6; x++) {
          let cursor = state.cursorOn && i === index + 1 && row === 1 && x < 5
          let map = cursor ? characterMap['cursor'] : characterMap[texts[1 - row][i]]

          context.fillStyle = map[6 - y][x] ?
            state.display.visibleColor.getStyle() :
            state.display.hiddenColor.getStyle()

          context.fillRect(x * (size + padding) + xOffset + i * (size + padding) * 6,
                           y * (size + padding) + yOffset + row * (size + 8 * padding) * 7,
                           size, size)
        }
      }
    }
  }
  state.display.material.map?.dispose()
  state.display.material.map = new THREE.CanvasTexture(canvas)
  state.display.material.needsUpdate = true
}

export function mousePressed (event) {
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(state.base.children, true)

  if (intersects.length > 0) {
    const button = intersects[0].object
    if (button.name.startsWith('button')) {
      button.position.y = 0.47
      state.buttonPressed = button
    }
  }
}

export function mouseReleased (event) {
  if (state.buttonPressed) {
    state.buttonPressed.position.y = 0.54484
    state.buttonPressed = null
  }
}

// Picking up the calculator itself is done by grab.js; this is for the lid
export function grabPressed (side, hit) {
  if (hit === state.lid) {
    const position = hand.getPosition(side)
    state.lid.worldToLocal(position)
    position.z = 0
    state.lid.side = side
    state.lid.point = position
    return true
  }
  return false
}

export function grabReleased (side) {
  if (state.lid.side === side) {
    state.lid.side = null
  }
}

function getCharacter (name) {
  let map = {'open': '(',
             'close': ')',
             'add': '+',
             'subtract': '-',
             'multiply': '*',
             'divide': '/',
             'dot': '.'}

  return map[name] || name
}

function pressButton (side, which) {
  let name = which.slice(7)

  if (name === 'clear') {
    state.inputText = '|'
    state.outputText = ''
    state.on = true
  }
  else if (state.on) {
    let index = state.inputText.indexOf('|')

    if (state.inputText[state.inputText.length - 1] === '=') {
      state.inputText = '|'
      state.outputText = ''
    }
    else if (name === 'delete') {
      if (index > 0) {
        state.inputText =
          state.inputText.slice(0, index - 1) +
          '|' +
          state.inputText.slice(index + 1)
      }
    }
    else if (name === 'equals') {
      state.inputText = state.inputText.replace('|', '')

      let result
      try {
        result = eval(state.inputText)
      }
      catch (e) {
        result = 'ERROR'
      }

      if (result === Infinity || result === -Infinity || isNaN(result)) {
        result = 'ERROR'
      }

      state.outputText = '' + result
      state.inputText = state.inputText + '='
    }
    else if (name === 'left') {
      if (index > 0) {
        state.inputText =
          state.inputText.slice(0, index - 1) +
          '|' +
          state.inputText.slice(index - 1, index) +
          state.inputText.slice(index + 1)
      }
    }
    else if (name === 'right') {
      if (index < state.inputText.length - 1) {
        state.inputText =
          state.inputText.slice(0, index) +
          state.inputText.slice(index + 1, index + 2) +
          '|' +
          state.inputText.slice(index + 2)
      }
    }
    else {
      state.inputText =
        state.inputText.slice(0, index) +
        getCharacter(name) +
        state.inputText.slice(index)
    }
  }

  if (state.on) {
    player.play('button')
    state.lastTimePress = new Date().getTime()
    state.cursorOn = true
    updateDisplay()
    util.pulse(side, 0.5, 50)
  }
}

function moveButton (which) {
  let button = state.base.getObjectByName(which)
  let collision = button.children[0]
  let collisionPosition = new THREE.Vector3()
  collision.getWorldPosition(collisionPosition)

  let rightTipPosition = hand.isPointing('right') ?
      hand.getTipPosition('right') :
      new THREE.Vector3(-1000, 0, 0)

  let leftTipPosition = hand.isPointing('left') ?
      hand.getTipPosition('left') :
      new THREE.Vector3(-1000, 0, 0)

  let tipPosition, side
  if (rightTipPosition.distanceTo(collisionPosition) <
      leftTipPosition.distanceTo(collisionPosition)) {
    tipPosition = rightTipPosition
    side = 'right'
  }
  else {
    tipPosition = leftTipPosition
    side = 'left'
  }

  let oldY = button.position.y
  if (util.isInsideObject(collision, tipPosition)) {
    button.position.y -= 0.02
  }
  else {
    button.position.y += 0.02
  }

  let minY = 0.47
  let maxY = 0.54484
  let midY = (minY + maxY) / 2

  button.position.y = util.within(button.position.y, minY, maxY)

  let offset = 0.01
  if (!button.pressed && button.position.y < midY - offset) {
    button.pressed = true
    pressButton(side, which)
  }
  else if (button.pressed && button.position.y > midY + offset) {
    button.pressed = false
  }
}

function setLidAngle () {
  const lid = state.lid
  if (lid.side) {
    let xAxis = new THREE.Vector3(1, 0, 0)
    let zAxis = new THREE.Vector3(0, 0, 1)
    xAxis.applyQuaternion(lid.quaternion)
    zAxis.applyQuaternion(lid.quaternion)

    const target = hand.getPosition(lid.side)

    lid.worldToLocal(target)
    target.z = 0

    let a = util.signedAngle(xAxis, lid.point, zAxis)
    let b = util.signedAngle(xAxis, target, zAxis)

    lid.rotation.z += util.toRadians(b - a)
    lid.rotation.z = util.within(lid.rotation.z, 0, Math.PI)

    if (lid.rotation.z < 0.1) {
      lid.rotation.z = 0
      turnOffDisplay()
    }
    if (lid.rotation.z > Math.PI - 0.1) {
      lid.rotation.z = Math.PI
    }
  }
}

export function update () {
  for (let name of state.buttonNames) {
    moveButton('button-'+ name)
  }

  if (getTime() > 10000) {
    turnOffDisplay()
  }
  setLidAngle()
}
