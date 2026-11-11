import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from './util.js'
import * as hand from './hand.js'

// The watch on the left wrist. Touching its face with the right index
// fingertip (any hand pose) opens and closes the gadget menu. The tip has to
// come close, and go well away again before the next touch counts, so
// passing near it does nothing.
//
// The model, assets/watch/watch.glb, is modelled in Blender around the hand
// model and exported already in the left grip's space. Its `face` (the
// button and star) dips along its parent's +y, which points out of the face,
// and `touch`, an empty at the top of the face, is where the fingertip goes.

const TOUCH = 0.035                   // fingertip this near the face: a touch
const AWAY = 0.08                     // and this far before the next one
const DIP = 0.003                     // how far the face dips on a touch

let watch, face, touch
let depth = 0
let armed = true

export async function create () {
  const gltf = await new GLTFLoader().loadAsync('watch/watch.glb')
  watch = gltf.scene
  watch.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true
    }
  })
  face = watch.getObjectByName('face')
  touch = watch.getObjectByName('touch')
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
