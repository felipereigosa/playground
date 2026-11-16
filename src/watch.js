import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from './util.js'
import * as hand from './hand.js'

// The watch on the left wrist. Pushing its button with the right index
// fingertip while pointing (grab held and trigger not, on a controller; the
// pointing pose, on a tracked hand) opens and closes the gadget menu, the
// same rule as the calculator's keys, so a hand passing by does nothing.
// It counts as soon as the tip gets into the button, and not again until the
// tip has gone back up, above the face and AWAY from it: going too deep, or
// pulling back out through the button, doesn't count twice. Like the
// calculator's keys, the button sinks while the tip is in it and rises again
// when it leaves.
//
// The model, assets/watch/watch.glb, is modelled in Blender around the hand
// model and exported already in the left grip's space. Its `face` (the
// button and star) sinks along its parent's -y (+y points out of the face),
// and `touch`, an empty at the top of the face, is where the fingertip goes.

const RADIUS = 0.03                   // the button's reach around its axis
const ABOVE = 0.008                   // and above its top, for the tip
const BELOW = 0.06                    // and how far below the top it goes
const AWAY = 0.05                     // tip this far above it: ready again
const TRAVEL = 0.005                  // how far the button goes down
const STEP = TRAVEL / 4               // and how far it moves in a frame

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

  // Where the wrist is, for tracked hands: the middle of the band, the
  // direction out of the face, and the forearm's direction, from the knob on
  // the elbow side to the one on the hand side (names lose their dots)
  watch.updateMatrixWorld(true)
  const centre = part => new THREE.Box3().setFromObject(part)
    .getCenter(new THREE.Vector3())
  const named = start => {
    let found
    watch.traverse(o => { if (!found && o.name.startsWith(start)) found = o })
    return found
  }
  hand.setWatchFrame(
    centre(named('band')),
    new THREE.Vector3(0, 1, 0)
      .applyQuaternion(face.parent.getWorldQuaternion(new THREE.Quaternion())),
    centre(named('knob_hand')).sub(centre(named('knob_elbow'))))
  avatar.controllers.left.add(watch)
}

// True on the frame the button is pushed
export function update () {
  if (!watch) {
    return false
  }
  const tip = face.parent.worldToLocal(hand.getTipPosition('right'))
  const top = touch.position.y
  const inside = hand.isPointing('right') &&
    Math.hypot(tip.x, tip.z) < RADIUS &&
    tip.y < top + ABOVE && tip.y > top - BELOW

  depth = util.within(depth + (inside ? STEP : -STEP), 0, TRAVEL)
  face.position.y = -depth

  if (armed && inside) {
    armed = false
    util.pulse('right', 0.6, 40)
    return true
  }
  if (!armed && tip.y > top &&
      tip.distanceTo(new THREE.Vector3(0, top, 0)) > AWAY) {
    armed = true
  }
  return false
}
