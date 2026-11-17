import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// The Tripo blaster as a plain object to pick up and look at, to judge the
// model in the hand before it gets its two halves, trigger and beam.
export async function create () {
  const gltf = await new GLTFLoader().loadAsync('gun/blaster.glb')
  const blaster = gltf.scene.getObjectByName('blaster')
  blaster.getObjectByName('collision').visible = false
  blaster.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true
    }
  })
  return blaster
}
