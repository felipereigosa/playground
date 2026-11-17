import * as THREE from 'three'
// import * as CANNON from 'cannon-es'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { VelocityEstimator } from "./velocity.js"
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as grab from './grab.js' // TEMPORARY, for the trace
import * as util from './util.js'
import * as world from './world'
import * as hand from './hand.js'
import * as environment from './environment.js'

let entered

const buttonNames = ["trigger", "grab", "", "thumbstick", "x", "y", ""]
let oldState = {left: {buttons: [0, 0, 0, 0, 0, 0, 0], axes: [0, 0]},
                right: {buttons: [0, 0, 0, 0, 0, 0, 0], axes: [0, 0]}}

function getAxes (hand) {
  return oldState[hand].axes
}

function pollControllers () {
  const session = renderer.xr.getSession()
  if (session) {
    for (const source of session.inputSources) {
      // A tracked hand's gamepad (a pinch and the system's gestures) would
      // come out as trigger, X and Y: hands work by gestures instead, see
      // hand.track()
      if (source.hand) {
        oldState[source.handedness].axes = [0, 0]
      }
      else if (source.gamepad) {
        const controller = avatar.controllers[source.handedness]
        if (!controller.actuator) {
          controller.actuator = source.gamepad.hapticActuators[0]
        }
        const buttons = source.gamepad.buttons.map((b) => b.value)
        for (let i = 0; i < 7; i++) {
          if (buttons[i] > 0.5 && oldState[source.handedness].buttons[i] < 0.5) {
            try {
              traceButton(source.handedness, buttonNames[i])  // TEMPORARY
              buttonPressed(source.handedness, buttonNames[i])
            }
            catch (error) {
              console.log(`input error ${error}`)
            }
          }
          else if (buttons[i] === 0 &&
                   oldState[source.handedness].buttons[i] !== 0) {
            try {
              buttonReleased(source.handedness, buttonNames[i])
            }
            catch (error) {
              console.log(`input error ${error}`)
            }
          }
        }
        oldState[source.handedness].buttons = [...buttons]
        oldState[source.handedness].axes = source.gamepad.axes.slice(2)
      }
    }
  }
}

// // function createStaticBody (x, y, z, hw, hh, hd) {
// //   const shape = new CANNON.Box(new CANNON.Vec3(hw, hh, hd))
// //   const body = new CANNON.Body({mass: 0})
// //   body.addShape(shape)
// //   body.position.set(x, y, z)
// //   physics.addBody(body)
// // }

async function init () {
  try {
    if (new URLSearchParams(location.search).has('emulate')) {
      (await import('./emulate.js')).install()
    }
    // The hand tracking demo instead of the playground
    if (new URLSearchParams(location.search).has('hands')) {
      (await import('./hands-demo.js')).start()
      return
    }

    window.scene = new THREE.Scene()
    environment.create()

    const ratio = window.innerWidth / window.innerHeight
    window.camera = new THREE.PerspectiveCamera(60, ratio, 0.1, 5000)
    camera.position.set(2, 2, 2)

    let axesHelper = new THREE.AxesHelper(20)
    axesHelper.name = 'axis'
    axesHelper.visible = false
    scene.add(axesHelper)

    window.renderer = new THREE.WebGLRenderer({antialias: true})
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    renderer.shadowMap.enabled = true

    window.controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.mouseButtons = {
      RIGHT: THREE.MOUSE.ROTATE
    }

    // vr

    entered = false

    window.avatar = new THREE.Group()
    avatar.add(camera)
    avatar.controllers = {}
    avatar.speed = 0.03
    avatar.position.y = -0.2
    scene.add(avatar)

    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.xr.enabled = true
    //renderer.shadowMap.enabled = true
    renderer.xr.addEventListener('sessionstart', () => {
      entered = true
      framesUntilLyingCheck = 30
    })
    renderer.xr.addEventListener('sessionend', () => {
      entered = false
    })

    //     window.physics = new CANNON.World()
    //     physics.gravity.set(0, -9.82, 0)
    //     physics.allowSleep = true

    let leftController, rightController

    const xrSupported = navigator.xr
      ? navigator.xr.isSessionSupported('immersive-vr')
      : Promise.resolve(false)
    xrSupported
      .then(isVR => {
        // Moved every frame by hand.track() to the controller or tracked
        // hand of its side
        leftController = new THREE.Group()
        leftController.name = 'left_controller'
        leftController.velocityEstimator = new VelocityEstimator()
        avatar.add(leftController)
        avatar.controllers['left'] = leftController
        leftController.position.y = -1000

        rightController = new THREE.Group()
        rightController.name = 'right_controller'
        rightController.velocityEstimator = new VelocityEstimator()
        avatar.add(rightController)
        avatar.controllers['right'] = rightController
        rightController.position.y = -1000

        if (!isVR) {
          avatar.position.y = 0
        }
        else {
          hand.setupTracking()
          document.body.appendChild(VRButton.createButton(renderer))
          // On the headset a click anywhere on the page enters VR
          document.addEventListener('click', event => {
            const button = document.getElementById('VRButton')
            if (!entered && button && event.target !== button) {
              button.click()
            }
          })
        }
      })

    const rightHand = await hand.load()
    rightController.add(rightHand)

    const leftHand = await hand.load()
    leftHand.scale.x *= -1
    leftController.add(leftHand)

    renderer.setAnimationLoop(render)

//     scene.traverse(child => {
//       child.background = true
//     })

    restoreView()

    if (world?.init) {
      world?.init()
    }
  }
  catch (error) {
    console.log(`init error ${error}`)
  }
}

const DEAD_ZONE = 0.3

// TEMPORARY, parked 2026-11-17 until the walking sticks again (the left stick
// read as pushed with nobody touching it; the cube scrambling by
// itself was its trigger, since removed): window.trace, read with
// scripts/quest-eval.mjs. One entry per
// stretch of movement (what moved the player, for how long, the range of the
// raw left stick during it, how far the player and a held or loose blaster
// went) and one per button press, with what each hand held.
const trace = window.trace = []
let traceAvatar = null
let traceRun = null
const traceHeld = () => (grab.heldIn('left')?.name || '-') + '/' + (grab.heldIn('right')?.name || '-')
function traceButton (side, button) {
  const pad = [...(renderer.xr.getSession()?.inputSources || [])].find(s => s.handedness === side)?.gamepad
  trace.push({t: Math.round(performance.now()), press: side + ' ' + button, held: traceHeld(),
    buttons: pad ? pad.buttons.map(b => +b.value.toFixed(2)) : null})
  if (trace.length > 3000) trace.shift()
}
function traceStep (step) {
  if (step === 'frame') return
  avatar.updateMatrixWorld()
  const at = new THREE.Vector3().setFromMatrixPosition(avatar.matrixWorld)
  const moved = traceAvatar ? at.distanceTo(traceAvatar) : 0
  traceAvatar = at
  if (moved <= 0.001) return
  const now = Math.round(performance.now())
  const left = [...(renderer.xr.getSession()?.inputSources || [])].find(s => s.handedness === 'left')
  const raw = left?.gamepad ? [...left.gamepad.axes].slice(2) : [NaN, NaN]
  if (!traceRun || traceRun.step !== step || now - traceRun.end > 60) {
    traceRun = {t: now, end: now, step, frames: 0, moved: 0, x: [raw[0], raw[0]], y: [raw[1], raw[1]],
      source: left ? (left.hand ? 'hand' : 'pad') : 'none', held: traceHeld()}
    trace.push(traceRun)
    if (trace.length > 3000) trace.shift()
  }
  traceRun.end = now
  traceRun.frames++
  traceRun.moved = +(traceRun.moved + moved).toFixed(2)
  traceRun.x = [Math.min(traceRun.x[0], raw[0]), Math.max(traceRun.x[1], raw[0])].map(v => +v.toFixed(2))
  traceRun.y = [Math.min(traceRun.y[0], raw[1]), Math.max(traceRun.y[1], raw[1])].map(v => +v.toFixed(2))
}

function move () {
  const direction = new THREE.Vector3()
  const [lx, lz] = getAxes("left")
  direction.set(lx, 0, lz)

  // A wide dead zone: a worn stick that doesn't come back to the middle
  // shouldn't walk you off
  if (direction.length() > DEAD_ZONE) {
    direction.applyEuler(camera.rotation)
    direction.applyEuler(avatar.rotation)
    direction.y = 0
    direction.normalize()
    direction.multiplyScalar(avatar.speed)
    avatar.position.add(direction)
  }

  avatar.position.x = util.within(avatar.position.x, -5.5, 5.5)
  avatar.position.z = util.within(avatar.position.z, -5.5, 5.5)
}

// Turns about the vertical through the head, so it also works when the
// avatar is tilted by alignToHead
function rotateAroundHead (angle) {
  const up = new THREE.Vector3(0, 1, 0)
  const head = camera.getWorldPosition(new THREE.Vector3())
  avatar.position.sub(head).applyAxisAngle(up, angle).add(head)
  avatar.rotateOnWorldAxis(up, angle)
}

let thumb = false
function turn () {
  const value = getAxes('right')[0]
  const angleSize = util.toRadians(45)
  if (value > 0.9 && !thumb) {
    thumb = true
    rotateAroundHead(-angleSize)
  }
  else if (value < -0.9 && !thumb) {
    thumb = true
    rotateAroundHead(angleSize)
  }
  else if (value === 0) {
    thumb = false
  }
}

let thumb2 = false
function adjustHeight () {
  const value = getAxes('right')[1]
  if (value > 0.9 && !thumb2) {
    thumb2 = true
    avatar.position.y = util.within(avatar.position.y - 0.5, -0.5, 11.5)
  }
  else if (value < -0.9 && !thumb2) {
    thumb2 = true
    avatar.position.y = util.within(avatar.position.y + 0.5, -0.5, 11.5)
  }
  else if (value === 0) {
    thumb2 = false
  }
}

// Lying down: turns the world so that "up" is wherever the top of the head
// points now and the eyes look level, and puts the head just in front of the
// current gadget. Floor and grid are hidden, leaving the sky. Left X does it
// any time, and it happens by itself on entering VR with the head tilted
// more than 45 degrees.
let framesUntilLyingCheck = 0

function alignToHead () {
  if (!renderer.xr.isPresenting) return

  scene.updateMatrixWorld(true)
  const headNow = camera.getWorldPosition(new THREE.Vector3())
  const target = world.focusPoint()
  const headTarget = target
    ? target.add(new THREE.Vector3(0, 0.15, 0.45))
    : headNow

  avatar.quaternion.copy(camera.quaternion).invert()
  const headOffset = camera.position.clone().applyQuaternion(avatar.quaternion)
  avatar.position.copy(headTarget).sub(headOffset)

  for (const name of ['ground', 'grid']) {
    scene.getObjectByName(name).visible = false
  }
}

function checkLying () {
  if (framesUntilLyingCheck > 0 && renderer.xr.isPresenting &&
      --framesUntilLyingCheck === 0) {
    const up = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
    if (up.y < Math.cos(util.toRadians(45))) {
      alignToHead()
    }
  }
}

// Left Y: end the VR session and ask the dev server (on the laptop) to put
// the Quest back on the laptop's desktop in Moonlight.
function backToDesktop () {
  fetch('/desktop', {method: 'POST'})
  renderer.xr.getSession()?.end()
}

export function buttonPressed (side, button) {
  if (side === 'left' && button === 'y') {
    backToDesktop()
  }
  else if (side === 'left' && button === 'x') {
    alignToHead()
  }
  else {
    if (world?.buttonPressed) {
      world?.buttonPressed(side, button)
    }
    hand.animate(side, button, true)
  }
}

export function buttonReleased (side, button) {
  // Left X and Y are taken: X aligns to the head, Y leaves VR
  if (side !== 'left' || (button !== 'x' && button !== 'y')) {
    if (world?.buttonReleased) {
      world?.buttonReleased(side, button)
    }
    hand.animate(side, button, false)
  }
}

function render () {
  try {
    if (entered) {
      for (const {side, pressed} of hand.track()) {
        pressed ? buttonPressed(side, 'grab') : buttonReleased(side, 'grab')
      }
    }
    renderer.render(scene, camera)

    // physics.fixedStep()
    pollControllers()
    traceStep('frame')
    move()
    traceStep('walk')
    turn()
    traceStep('turn')
    adjustHeight()
    traceStep('height')
    checkLying()
    traceStep('lying')

    for (let side of ['right', 'left']) {
      hand.update(side)
    }

    if (world?.update) {
      world?.update()
    }
  }
  catch (error) {
    console.log(`render error ${error}`)
  }
}

init()

let shiftPressed = false
let controlPressed = false

document.addEventListener('mousedown', function(event) {
  if (event.button === 0) {
    if (controlPressed) {
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      mouse.y = - (event.clientY / window.innerHeight) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      let children = scene.children.filter(child => !child.background)
      const intersects = raycaster.intersectObjects(children, true)
      if (intersects.length > 0) {
        let child = intersects[0].object
        let position = new THREE.Vector3()
        child.getWorldPosition(position)
        controls.target = position
        controls.update()
      }
    }
    else {
      if (world?.mousePressed) {
        world?.mousePressed(event)
      }
    }
  }
})

document.addEventListener('mousemove', function(event) {
  if (world?.mouseMoved) {
    world?.mouseMoved(event)
  }
})

document.addEventListener('mouseup', function(event) {
  if (event.button === 0) {
    if (world?.mouseReleased) {
      world?.mouseReleased(event)
    }
  }
})

function saveView () {
  console.log('saving view')
  fetch('/store-view', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({position: camera.position,
                          rotation: camera.rotation,
                          pivot: controls.target})
  })
}

function restoreView () {
  console.log('restoring view')
  fetch('/get-view')
    .then(response => response.json())
    .then(result => {
      camera.position.copy(result.position)
      camera.rotation.copy(result.rotation)
      controls.target.copy(result.pivot)
    })
}

// function resetScene () {
//   let toRemove = []
//   scene.traverse(child => {
//     if (!child.background) {
//       toRemove.push(child)
//     }
//   })

//   let right = avatar.controllers.right
//   if (right.held) {
//     right.remove(right.held)
//     right.held = null
//   }

//   let left = avatar.controllers.left
//   if (left.held) {
//     left.remove(left.held)
//     left.held = null
//   }

//   for (let child of toRemove) {
//     scene.remove(child)
//   }

//   if (world?.init) {
//     world?.init()
//   }
// }

document.addEventListener('keydown', function(event) {
  if (event.key === 'Shift') {
    shiftPressed = true
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE //########### why?
  }
  else if (event.key === 'Control') {
    controlPressed = true
  }
  else if (event.key === 'v' && controlPressed) {
    saveView()
  }
  else if (event.key === 'v') {
    restoreView()
  }
  else if (event.key === 'a') {
    let axis = scene.getObjectByName('axis')
    axis.visible = !axis.visible
  }
  // else if (event.key === 'Backspace') {
  //   resetScene()
  // }
  else {
    if (world?.keyPressed) {
      world?.keyPressed(event)
    }
  }
})

document.addEventListener('keyup', function(event) {
  if (event.key === 'Shift') {
    shiftPressed = false
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
  }
  else if (event.key === 'Control') {
    controlPressed = false
  }
  else {
    if (world?.keyReleased) {
      world?.keyReleased(event)
    }
  }
})
