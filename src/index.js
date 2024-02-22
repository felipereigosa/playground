import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { BoxLineGeometry } from 'three/addons/geometries/BoxLineGeometry.js'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VelocityEstimator } from "./velocity.js"
import * as util from './util.js'
import * as world from './world'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as recorder from './recorder.js'

let renderer
let entered
let controls

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

function createStaticBody (x, y, z, hw, hh, hd) {
  const shape = new CANNON.Box(new CANNON.Vec3(hw, hh, hd))
  const body = new CANNON.Body({mass: 0})
  body.addShape(shape)
  body.position.set(x, y, z)
  physics.addBody(body)
}

function playAction (object, actionName, timeScale) {
  const mixer = object.mixer
  const clip = THREE.AnimationClip.findByName(object.clips, actionName)
  const action = mixer.clipAction(clip, object)
  mixer.stopAllAction()
  action.reset()
  action.timeScale = timeScale
  action.loop = THREE.LoopOnce
  action.clampWhenFinished = true
  action.play()
}

function createEnvironment () {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6)
  hemiLight.position.set(0, 50, 0)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1)
  dirLight.color.setHSL(0.1, 1, 0.95)
  dirLight.position.set(1, 1.75, 0)
  dirLight.position.multiplyScalar(30)
  scene.add(dirLight)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.width = 4096 * 4
  dirLight.shadow.mapSize.height = 4096 * 4
  const d = 6
  dirLight.shadow.camera.left = - d
  dirLight.shadow.camera.right = d
  dirLight.shadow.camera.top = d
  dirLight.shadow.camera.bottom = -d
  dirLight.shadow.camera.far = 500

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12),
                                new THREE.MeshLambertMaterial({color: 0xaaaaaa}))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const room = new THREE.LineSegments(
    new BoxLineGeometry(12, 0.001, 12, 20, 1, 20),
    new THREE.LineBasicMaterial({color: 0x808080})
  )
  room.geometry.translate(0, 0, 0)
  scene.add(room)

  const vertexShader = `varying vec3 vWorldPosition;
                        void main() {
                          vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
                          vWorldPosition = worldPosition.xyz;
                          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                        }`

  const fragmentShader = `uniform vec3 topColor;
                          uniform vec3 bottomColor;
                          uniform float offset;
                          uniform float exponent;
                          varying vec3 vWorldPosition;
                          void main() {
                            float h = normalize( vWorldPosition + offset ).y;
                            gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( h, exponent ), 0.0 ) ), 1.0 );
                          }`

  const c = new THREE.Color(0xffffff)
  c.setHSL(0.6, 1, 0.6)
  const uniforms = {
    'topColor': {value: c},
    'bottomColor': {value: new THREE.Color(0xffffff)},
    'offset': {value: 500},
    'exponent': {value: 0.6}
  }
  scene.fog.color.copy(uniforms['bottomColor'].value)

  const skyGeo = new THREE.SphereGeometry(4000, 32, 15)
  const skyMat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.BackSide
  })

  const sky = new THREE.Mesh(skyGeo, skyMat)
  scene.add(sky)

  createStaticBody(0, -0.1, 0, 6, 0.1, 6)
  createStaticBody(0, 6, -6.1, 6, 6, 0.1)
  createStaticBody(0, 6, 6.1, 6, 6, 0.1)
  createStaticBody(-6.1, 6, 0, 0.1, 6, 6)
  createStaticBody(6.1, 6, 0, 0.1, 6, 6)
}

async function init () {
  try {
    entered = false
    window.scene = new THREE.Scene()
    scene.background = new THREE.Color().setHSL( 0.6, 0, 1 )
    scene.fog = new THREE.Fog( scene.background, 1, 5000 )
    window.avatar = new THREE.Group()
    const width = window.innerWidth
    const height = window.innerHeight
    window.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 5000)
    camera.position.set(0, 1, 4)
    avatar.clock = new THREE.Clock()

    avatar.add(camera)
    avatar.controllers = {}
    avatar.speed = 0.03
    avatar.position.y = -0.5
    scene.add(avatar)

    window.physics = new CANNON.World()
    physics.gravity.set(0, -9.82, 0)
    physics.allowSleep = true

    createEnvironment()

    renderer = new THREE.WebGLRenderer({antialias: true})
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.xr.enabled = true
    renderer.shadowMap.enabled = true
    document.body.appendChild(renderer.domElement)
    renderer.xr.addEventListener('sessionstart', () => {
      entered = true
    })

    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1, 0)
    controls.mouseButtons = {
      RIGHT: THREE.MOUSE.ROTATE
    }

    let leftController, rightController

    navigator.xr.isSessionSupported('immersive-vr')
      .then(isVR => {
        leftController = isVR ? renderer.xr.getControllerGrip(0) : new THREE.Group()
        leftController.name = 'left_controller'
        leftController.velocityEstimator = new VelocityEstimator()
        avatar.add(leftController)
        avatar.controllers['left'] = leftController

        rightController = isVR ? renderer.xr.getControllerGrip(1) : new THREE.Group()
        rightController.name = 'right_controller'
        rightController.velocityEstimator = new VelocityEstimator()
        avatar.add(rightController)
        avatar.controllers['right'] = rightController

        if (!isVR) {
          avatar.position.y = 0
        }
        else {
          document.body.appendChild(VRButton.createButton(renderer))
        }
      })

    const loader = new GLTFLoader()

    // const gltf = await loader.loadAsync('axis.glb')
    // const axis = gltf.scene
    // scene.add(axis)
    // axis.background = true

    const gltf = await loader.loadAsync('hand.glb')
    const rightHand = gltf.scene
    rightHand.name = 'right_hand'
    rightController.add(rightHand)
    rightHand.clips = gltf.animations
    rightHand.mixer = new THREE.AnimationMixer(gltf.scene)
    rightHand.scale.set(0.95, 0.95, 0.95)

    rightHand.traverse(function (child) {
      if (child.isMesh) child.castShadow = true
    })

    const leftHand = util.clone(rightHand)
    leftHand.name = 'left_hand'
    leftHand.scale.set(-0.95, 0.95, 0.95)
    leftHand.clips = gltf.animations
    leftHand.mixer = new THREE.AnimationMixer(gltf.scene)
    leftController.add(leftHand)

    renderer.setAnimationLoop(render)

    scene.traverse(child => {
      child.background = true
    })

    restoreView()
    world.init()
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
  const value = getAxes("right")[0]
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
  const value = getAxes("right")[1]
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

function getHandTransform (mesh) {
  let position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const rotation = new THREE.Euler()
  mesh.getWorldPosition(position)
  mesh.getWorldQuaternion(quaternion)
  rotation.setFromQuaternion(quaternion)
  return {position, rotation}
}

export function buttonPressed (hand, button) {
  if (button === 'x' && hand === 'right') {
    recorder.toggle()
  }
  else {
    const handMesh = avatar.getObjectByName(`${hand}_hand`)
    if (button === "grab") {
      playAction(handMesh, "close", 3)
    }
    let action = getHandTransform(handMesh)
    action.hand = hand
    action.button = button
    recorder.log('buttonPressed', action)
    world.buttonPressed(hand, button)
  }
}

export function buttonReleased (hand, button) {
  if (!(button === 'x' && hand === 'right')) {
    const handMesh = avatar.getObjectByName(`${hand}_hand`)
    if (button === "grab") {
      playAction(handMesh, "open", 3)
    }
    let action = getHandTransform(handMesh)
    action.hand = hand
    action.button = button
    recorder.log('buttonReleased', action)
    world.buttonReleased(hand, button)
  }
}

const position = new THREE.Vector3()
const quaternion = new THREE.Quaternion()

function render () {
  try {
    renderer.render(scene, camera)

    physics.fixedStep()
    pollControllers()
    move()
    turn()
    adjustHeight()

    const delta = avatar.clock.getDelta()
    const rightHand = scene.getObjectByName("right_hand")
    rightHand.mixer.update(delta)
    const leftHand = scene.getObjectByName("left_hand")
    leftHand.mixer.update(delta)

    let rightAction = getHandTransform(rightHand)
    rightAction.hand = 'right'
    recorder.log('moved', rightAction)

    let leftAction = getHandTransform(leftHand)
    leftAction.hand = 'left'
    recorder.log('moved', leftAction)

    world.update()
    controls.update()
  }
  catch (error) {
    console.log(`render error ${error}`)
  }
}

init()

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
      }
    }
    else {
      recorder.log('mousePressed', event)
      world.mousePressed(event)
    }
  }
})

document.addEventListener('mousemove', function(event) {
  world.mouseMoved(event)
})

document.addEventListener('mouseup', function(event) {
  if (event.button === 0) {
    recorder.log('mouseReleased', event)
    world.mouseReleased(event)
  }
})

let shiftPressed = false
let controlPressed = false

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

document.addEventListener('keydown', function(event) {
  if (event.key === 'Shift') {
    shiftPressed = true
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE //########### why?
  }
  else if (event.key === 'Control') {
    controlPressed = true
  }
  else if (event.key === 'r') {
    recorder.toggle()
  }
  else if (event.key === 'p') {
    recorder.playback()
  }
  else if (event.key === 'v' && controlPressed) {
    saveView()
  }
  else if (event.key === 'v') {
    restoreView()
  }
  else if (event.key === 'Backspace') {
    let toRemove = []
    scene.traverse(child => {
      if (!child.background) {
        toRemove.push(child)
      }
    })

    for (let child of toRemove) {
      scene.remove(child)
    }

    world.init()
  }
  else {
    world.keyPressed(event)
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
    world.keyReleased(event)
  }
})

module.hot.accept('./world', function () {});
