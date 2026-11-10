// Loads one gadget, picked with ?gadget=<name> in the URL (calculator by
// default), and passes the input events on to it. Temporary, until the
// watch and summoning replace it.

const gadgets = {
  calculator: () => import('./calculator/calculator.js'),
  tiles: () => import('./tiles/tiles.js'),
  cube: () => import('./cube/cube.js'),
  gun: () => import('./gun/gun.js'),
}

import * as THREE from 'three'
import * as player from './player.js'

let gadget = null
let gadgetObjects = []

export async function init () {
  player.init()
  const name = new URLSearchParams(location.search).get('gadget') || 'calculator'
  const loaded = await gadgets[name]()
  const before = new Set(scene.children)
  await loaded.init()
  gadgetObjects = scene.children.filter(child => !before.has(child) && child.type !== 'Audio')
  gadget = loaded
  console.log(`world init: ${name}`)
}

// Centre of what the gadget added to the scene, wherever it is now
export function focusPoint () {
  const box = new THREE.Box3()
  for (const object of gadgetObjects) {
    box.expandByObject(object)
  }
  return box.isEmpty() ? null : box.getCenter(new THREE.Vector3())
}

function forward (method) {
  return (...args) => gadget?.[method]?.(...args)
}

export const buttonPressed = forward('buttonPressed')
export const buttonReleased = forward('buttonReleased')
export const mousePressed = forward('mousePressed')
export const mouseReleased = forward('mouseReleased')
export const mouseMoved = forward('mouseMoved')
export const keyPressed = forward('keyPressed')
export const keyReleased = forward('keyReleased')
export const update = forward('update')
