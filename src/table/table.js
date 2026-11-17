import * as THREE from 'three'
import * as physics from '../physics.js'

// A round table on one leg. Let go anywhere it stands itself up on the
// floor under that spot (stands, see world.js); its top is a surface
// (physics.js): what falls lands on it, and gadgets that otherwise stay
// where they are let go come down to rest on it. Carried by its top. The
// shape is a placeholder made here, until there is a model.

export const stands = true

const HEIGHT = 0.85
const RADIUS = 0.45
const TOP = 0.04            // thickness

let root = null

export function make () {
  const table = new THREE.Group()
  table.name = 'table'
  const white = new THREE.MeshLambertMaterial({color: 0xf4f1e8})
  const charcoal = new THREE.MeshLambertMaterial({color: 0x2b2f38})
  const part = (geometry, material, y) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = y
    mesh.castShadow = true
    mesh.receiveShadow = true
    table.add(mesh)
    return mesh
  }
  part(new THREE.CylinderGeometry(RADIUS, RADIUS, TOP, 48), white, HEIGHT - TOP / 2)
  part(new THREE.CylinderGeometry(RADIUS * 0.96, RADIUS * 0.9, TOP * 0.6, 48), charcoal, HEIGHT - TOP * 1.3)
  part(new THREE.CylinderGeometry(0.035, 0.045, HEIGHT - TOP, 24), charcoal, (HEIGHT - TOP) / 2)
  part(new THREE.CylinderGeometry(0.2, 0.28, 0.03, 48), charcoal, 0.015)
  // Picked up by the top
  const collision = part(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.1, 16),
    new THREE.MeshBasicMaterial(), HEIGHT - 0.05)
  collision.name = 'collision'
  collision.visible = false
  collision.castShadow = false
  return table
}

export function create () {
  root = make()
  physics.addSurface(root, RADIUS, HEIGHT)
  return root
}

export function dispose () {
  physics.removeSurface(root)
  root = null
}
