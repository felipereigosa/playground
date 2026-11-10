import * as THREE from 'three'

let sounds = {}
let listener = null

export function init () {
  listener = new THREE.AudioListener()
  camera.add(listener)
  console.log('player init')
}

export async function load (filename) {
  const audioLoader = new THREE.AudioLoader()
  const buffer = await audioLoader.loadAsync(filename)
  const sound = new THREE.Audio(listener)
  sound.setBuffer(buffer)
  sound.setLoop(false)
  sound.setVolume(1)
  scene.add(sound)

  let slash = filename.indexOf('/')
  let dot = filename.indexOf('.')
  let tag = filename.slice(slash + 1, dot)

  sounds[tag] = sound
}

export function play (name) {
  let sound = sounds[name]

  sound.stop()
  sound.play()
}
