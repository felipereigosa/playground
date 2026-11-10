import * as THREE from 'three'
// import * as CANNON from 'cannon-es'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { VelocityEstimator } from "./velocity.js"
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as util from './util.js'
import * as world from './world'
import * as recorder from './recorder.js'
import * as hand from './hand.js'

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
      if (source.gamepad) {
        const controller = avatar.controllers[source.handedness]
        if (!controller.actuator) {
          controller.actuator = source.gamepad.hapticActuators[0]
        }
        const buttons = source.gamepad.buttons.map((b) => b.value)
        for (let i = 0; i < 7; i++) {
          if (buttons[i] > 0.5 && oldState[source.handedness].buttons[i] < 0.5) {
            try {
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
    window.scene = new THREE.Scene()
    scene.background = new THREE.Color('black')

    const ratio = window.innerWidth / window.innerHeight
    window.camera = new THREE.PerspectiveCamera(60, ratio, 0.1, 5000)
    camera.position.set(2, 2, 2)

    let axesHelper = new THREE.AxesHelper(20)
    axesHelper.name = 'axis'
    axesHelper.visible = true
    scene.add(axesHelper)

    window.renderer = new THREE.WebGLRenderer({antialias: true})
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    renderer.toneMapping = THREE.ReinhardToneMapping

    const hemiLight = new THREE.HemisphereLight(0xffeeb1, 0x080820, 4)
    scene.add(hemiLight)

    const light = new THREE.SpotLight('white', 4)
    light.position.set(-50, 50, 50)
    scene.add(light)

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
    })

    //     window.physics = new CANNON.World()
    //     physics.gravity.set(0, -9.82, 0)
    //     physics.allowSleep = true

    let leftController, rightController

    navigator.xr.isSessionSupported('immersive-vr')
      .then(isVR => {
        leftController = isVR ? renderer.xr.getControllerGrip(0) : new THREE.Group()
        leftController.name = 'left_controller'
        leftController.velocityEstimator = new VelocityEstimator()
        avatar.add(leftController)
        avatar.controllers['left'] = leftController
        leftController.position.y = -1000

        rightController = isVR ? renderer.xr.getControllerGrip(1) : new THREE.Group()
        rightController.name = 'right_controller'
        rightController.velocityEstimator = new VelocityEstimator()
        avatar.add(rightController)
        avatar.controllers['right'] = rightController
        rightController.position.y = -1000

        if (!isVR) {
          avatar.position.y = 0
        }
        else {
          document.body.appendChild(VRButton.createButton(renderer))
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

function move () {
  const direction = new THREE.Vector3()
  const [lx, lz] = getAxes("left")
  direction.set(lx, 0, lz)

  if (direction.length() > 0.1) {
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

let thumb = false
function turn () {
  const value = getAxes('right')[0]
  const angleSize = util.toRadians(45)
  if (value > 0.9 && !thumb) {
    thumb = true
    avatar.rotation.y -= angleSize
  }
  else if (value < -0.9 && !thumb) {
    thumb = true
    avatar.rotation.y += angleSize
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

export function buttonPressed (side, button) {
  if (button === 'x' && side === 'right') {
    recorder.toggleRecording()
  }
  else {
    let action = hand.getTransform(side)
    action.hand = side
    action.button = button
    recorder.log('buttonPressed', action)
    if (world?.buttonPressed) {
      world?.buttonPressed(side, button)
    }
    hand.animate(side, button, true)
  }
}

export function buttonReleased (side, button) {
  if (!(button === 'x' && side === 'right')) {
    let action = hand.getTransform(side)
    action.hand = side
    action.button = button
    recorder.log('buttonReleased', action)
    if (world?.buttonReleased) {
      world?.buttonReleased(side, button)
    }
    hand.animate(side, button, false)
  }
}

function render () {
  try {
    renderer.render(scene, camera)

    // physics.fixedStep()
    pollControllers()
    move()
    turn()
    adjustHeight()

    for (let side of ['right', 'left']) {
      hand.update(side)
      let action = hand.getTransform(side)
      action.hand = side
      recorder.log('moved', action)
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
  else if (event.key === 'p') {
    recorder.togglePlayback()
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
