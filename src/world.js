// Loads one gadget, picked with ?gadget=<name> in the URL (calculator by
// default), and passes the input events on to it. Temporary, until the
// watch and summoning replace it.

const gadgets = {
  calculator: () => import('./calculator/calculator.js'),
  tiles: () => import('./tiles/tiles.js'),
  cube: () => import('./cube/cube.js'),
  origami: () => import('./origami/origami.js'),
  gun: () => import('./gun/gun.js'),
}

import * as player from './player.js'

let gadget = null

export async function init () {
  player.init()
  const name = new URLSearchParams(location.search).get('gadget') || 'calculator'
  const loaded = await gadgets[name]()
  await loaded.init()
  gadget = loaded
  console.log(`world init: ${name}`)
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
