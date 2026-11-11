import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from './util.js'
import * as hand from './hand.js'

// The watch on the left wrist. Touching its face with the right index
// fingertip (any hand pose) opens and closes the gadget menu. The tip has to
// come close, and go well away again before the next touch counts, so
// passing near it does nothing.
//
// For now the model is made here: the calculator's yellow ON/C button on a
// plain band. Felipe will model the real watch later; createModel is the
// only part to replace. It must return the watch (placed in the left
// controller's grip space) with a child that dips when touched, `face`, and
// an empty object at the top of the face, `touch`, where the fingertip goes.

// Where the watch sits in the left grip's space, found by looking at the hand
// model in the emulator: the forearm runs along `forearm`, and the back of the
// hand faces `back`
const WRIST = new THREE.Vector3(-0.056, 0.074, 0.083)
const FOREARM = new THREE.Vector3(-0.1, 0.75, 0.65).normalize()
const BACK = new THREE.Vector3(-1, 0, 0)
const BAND_RADIUS = [0.024, 0.036]    // across the wrist: back-palm, side-side
const BAND_WIDTH = 0.022
const FACE_DIAMETER = 0.03
const FACE_TURN = -Math.PI / 2
const TOUCH = 0.035                   // fingertip this near the face: a touch
const AWAY = 0.08                     // and this far before the next one
const DIP = 0.003                     // how far the face dips on a touch

let watch, face, touch
let depth = 0
let armed = true

async function createModel () {
  const group = new THREE.Group()
  group.name = 'watch'

  // The band: a short open tube, flattened to the wrist's oval. Its axis is
  // the group's y, its back-of-hand side the group's +z.
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, BAND_WIDTH, 40, 1, true),
    new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.7, side: THREE.DoubleSide})
  )
  band.scale.set(BAND_RADIUS[1], 1, BAND_RADIUS[0])
  band.castShadow = true
  group.add(band)

  // The face: the calculator's yellow button, cap up (its own +y), turned so
  // it points out of the back of the wrist
  const gltf = await new GLTFLoader().loadAsync('calculator/calculator.glb')
  const button = gltf.scene.getObjectByName('button-clear')
  const collision = button.children.find(child => child.name.startsWith('collision'))
  // Kept turned as it is on the calculator, where pressing is along the
  // calculator's -y; only moved to the origin
  button.position.set(0, 0, 0)
  const holder = new THREE.Group()
  holder.add(button)
  holder.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(holder, true).getSize(new THREE.Vector3())
  const scale = FACE_DIAMETER / Math.max(size.x, size.z)

  const faceMount = new THREE.Group()
  faceMount.rotation.x = Math.PI / 2      // +y of the button to +z of the group
  faceMount.position.z = BAND_RADIUS[0]
  group.add(faceMount)

  const faceGroup = new THREE.Group()
  faceGroup.name = 'face'
  faceMount.add(faceGroup)
  holder.scale.setScalar(scale)
  holder.rotation.y = FACE_TURN    // the label along the forearm
  holder.position.y = size.y * scale / 2
  button.castShadow = true
  faceGroup.add(holder)

  collision.removeFromParent()
  const touchPoint = new THREE.Object3D()
  touchPoint.name = 'touch'
  touchPoint.position.y = size.y * scale
  faceGroup.add(touchPoint)

  return group
}

export async function create () {
  watch = await createModel()
  face = watch.getObjectByName('face')
  touch = watch.getObjectByName('touch')

  // Group y along the forearm, group z out of the back of the hand
  const y = FOREARM.clone()
  const z = BACK.clone().sub(y.clone().multiplyScalar(BACK.dot(y))).normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  watch.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  watch.position.copy(WRIST)
  avatar.controllers.left.add(watch)
}

// True on the frame the face is touched
export function update () {
  if (!watch) {
    return false
  }
  depth = Math.max(0, depth - DIP / 8)
  face.position.y = -depth

  const distance = hand.getTipPosition('right')
    .distanceTo(touch.getWorldPosition(new THREE.Vector3()))
  if (armed && distance < TOUCH) {
    armed = false
    depth = DIP
    util.pulse('right', 0.6, 40)
    return true
  }
  if (!armed && distance > AWAY) {
    armed = true
  }
  return false
}
