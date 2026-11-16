import * as THREE from 'three'
import * as tracked from './tracked-hand.js'

// Proof of concept for hand tracking, opened with ?hands in the URL instead
// of the playground. Each hand is drawn as sticks between its tracked joints,
// so you can see how well it follows your real hands (with passthrough when
// the headset offers it). A hand turns orange when it is clenched and blue
// when it is pointing, and a clenched hand inside the cube carries it.

let renderer, scene, camera, cube, floor
let framesIn = 0
const hands = []
const v = () => new THREE.Vector3()

export function start () {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.position.set(1, 3, 2)
  scene.add(sun)

  // A faint grid on the floor in VR, for a sense of place
  floor = new THREE.GridHelper(10, 20, 0x666670, 0x45454d)
  scene.add(floor)

  renderer = new THREE.WebGLRenderer({antialias: true, alpha: true})
  renderer.setPixelRatio(devicePixelRatio)
  renderer.setSize(innerWidth, innerHeight)
  renderer.xr.enabled = true
  document.body.appendChild(renderer.domElement)

  cube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12),
                        new THREE.MeshStandardMaterial({color: 0x44aa66, transparent: true,
                                                       opacity: 0.6}))
  cube.name = 'cube'
  cube.visible = false  // until it is placed in front of the head
  scene.add(cube)

  for (let i = 0; i < 2; i++) {
    const hand = tracked.create(renderer.xr.getHand(i), scene, scene)
    hand.holding = null  // the cube's pose relative to the wrist while carried
    hands.push(hand)
  }

  renderer.xr.addEventListener('sessionstart', () => {
    cube.visible = false
    framesIn = 0
  })
  document.body.appendChild(enterButton())
  renderer.setAnimationLoop(update)
  window.handsDemo = {hands, cube, measure: tracked.measure,
                      fistCentre: tracked.fistCentre}
  // What scripts/emulator.mjs waits for before a test
  Object.assign(window, {renderer, worldReady: true})
}

// Plain VR, or passthrough with ?hands=ar (when the browser has it), to
// compare the sticks with the real hands. The id and text match three's
// VRButton, so `npm run vr hands` can click it.
function enterButton () {
  const wantAR = new URLSearchParams(location.search).get('hands') === 'ar'
  const button = document.createElement('button')
  button.id = 'VRButton'
  button.textContent = 'ENTER VR'
  Object.assign(button.style, {
    position: 'absolute', bottom: '20px', left: 'calc(50% - 60px)',
    width: '120px', padding: '12px', font: '13px sans-serif',
  })
  button.onclick = async () => {
    const ar = wantAR && await navigator.xr?.isSessionSupported('immersive-ar')
    const session = await navigator.xr.requestSession(
      ar ? 'immersive-ar' : 'immersive-vr',
      {optionalFeatures: ['local-floor', 'hand-tracking']})
    scene.background = ar ? null : new THREE.Color(0x303038)
    floor.visible = !ar
    renderer.xr.setReferenceSpaceType('local-floor')
    await renderer.xr.setSession(session)
    button.textContent = 'IN VR'
    session.addEventListener('end', () => { button.textContent = 'ENTER VR' })
  }
  // On the headset a click anywhere on the page does it
  document.addEventListener('click', event => {
    if (event.target !== button && button.textContent === 'ENTER VR') {
      button.click()
    }
  })
  return button
}

function inside (point, mesh, margin = 0.02) {
  const local = mesh.worldToLocal(point.clone())
  const half = mesh.geometry.parameters.width / 2 + margin
  return Math.max(Math.abs(local.x), Math.abs(local.y), Math.abs(local.z)) < half
}

function wristMatrix (hand) {
  const wrist = hand.source.joints['wrist']
  return wrist?.visible ? wrist.matrixWorld : null
}

function grabAndRelease (hand, wasClenched) {
  const wrist = wristMatrix(hand)
  if (!wrist) return
  const free = !hands.some(h => h.holding)
  if (hand.clenched && !wasClenched && free) {
    const centre = tracked.fistCentre(hand)
    if (centre && inside(centre, cube)) {
      hand.holding = wrist.clone().invert().multiply(cube.matrixWorld)
    }
  }
  else if (!hand.clenched && hand.holding) {
    hand.holding = null
  }
  if (hand.holding) {
    new THREE.Matrix4().multiplyMatrices(wrist, hand.holding)
      .decompose(cube.position, cube.quaternion, cube.scale)
  }
}

// Puts the cube 35 cm in front of the eyes and a little below, whichever
// way the head points, so it works lying down too
function placeCube () {
  const head = camera.getWorldPosition(v())
  const q = camera.getWorldQuaternion(new THREE.Quaternion())
  cube.position.copy(head)
    .add(new THREE.Vector3(0, -0.1, -0.35).applyQuaternion(q))
  cube.quaternion.copy(q)
  cube.visible = true
}

function update () {
  if (!renderer.xr.isPresenting) {
    renderer.render(scene, camera)
    return
  }
  scene.updateMatrixWorld(true)

  let hover = false
  for (const hand of hands) {
    const wasClenched = hand.clenched
    tracked.classify(hand)
    grabAndRelease(hand, wasClenched)
    tracked.draw(hand)
    const centre = hand.group.visible && tracked.fistCentre(hand)
    if (centre && inside(centre, cube)) hover = true
  }
  const held = hands.some(h => h.holding)
  cube.material.color.set(held ? 0x99ff99 : hover ? 0x66cc88 : 0x44aa66)
  cube.material.emissive.set(held ? 0x224422 : 0x000000)

  renderer.render(scene, camera)
  // The camera only takes the head's pose during render, so the cube is
  // placed afterwards, a couple of frames into the session
  if (!cube.visible && ++framesIn > 2) placeCube()
}
