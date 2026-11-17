import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { threeToCannon, ShapeType } from 'three-to-cannon'

// One physics world (cannon-es) for everything that falls: the floor and
// the walls of the 12 m room, the bodies gadgets make for themselves (the
// bricks) or get from world.js (hull, for a gadget that falls when let go),
// and surfaces: flat round tops (the table) that things land on.

export const ROOM = 6       // the walls are this far from the middle (x and z)

export const world = new CANNON.World()
world.gravity.set(0, -9.82, 0)
world.allowSleep = true
world.defaultContactMaterial.restitution = 0.1
world.defaultContactMaterial.friction = 0.5
for (const [x, y, z, hw, hh, hd] of [[0, -0.1, 0, ROOM, 0.1, ROOM],
  [0, ROOM, -ROOM - 0.1, ROOM, ROOM, 0.1], [0, ROOM, ROOM + 0.1, ROOM, ROOM, 0.1],
  [-ROOM - 0.1, ROOM, 0, 0.1, ROOM, ROOM], [ROOM + 0.1, ROOM, 0, 0.1, ROOM, ROOM]]) {
  const body = new CANNON.Body({mass: 0})
  body.addShape(new CANNON.Box(new CANNON.Vec3(hw, hh, hd)))
  body.position.set(x, y, z)
  world.addBody(body)
}

// A body for an object from its collision mesh (a direct child), where the
// object is now; the object has to be a child of the scene
export function hull (object, mass = 1) {
  object.updateMatrixWorld(true)
  const collision = object.children.find(child => child.name.startsWith('collision'))
  const body = new CANNON.Body({mass})
  const p = collision.position.clone().multiply(object.scale)
  const q = collision.quaternion
  body.addShape(threeToCannon(collision, {type: ShapeType.HULL}).shape,
    new CANNON.Vec3(p.x, p.y, p.z), new CANNON.Quaternion(q.x, q.y, q.z, q.w))
  body.position.copy(object.position)
  body.quaternion.copy(object.quaternion)
  body.allowSleep = true
  body.sleepSpeedLimit = 0.3
  world.addBody(body)
  return body
}

// Surfaces: {object, radius, height, body}, the top a disc of that radius
// around the object's own y axis, `height` up it. It counts while the object
// stands in the scene at its full size (not carried, not an icon).
const surfaces = []
const THICKNESS = 0.3       // of the body under the top: a thin one throws things off

export function addSurface (object, radius, height) {
  const body = new CANNON.Body({mass: 0})
  body.addShape(new CANNON.Cylinder(radius, radius, THICKNESS, 16))
  surfaces.push({object, radius, height, body, inWorld: false})
}

export function removeSurface (object) {
  const index = surfaces.findIndex(surface => surface.object === object)
  if (index >= 0) {
    const [surface] = surfaces.splice(index, 1)
    if (surface.inWorld) {
      world.removeBody(surface.body)
    }
  }
}

const standing = surface =>
  surface.object.parent === scene && surface.object.scale.x > 0.95

const topOf = surface =>
  surface.object.localToWorld(new THREE.Vector3(0, surface.height, 0))

// The height of the surface under a point, or null when there is none
export function surfaceBelow (point) {
  let best = null
  for (const surface of surfaces.filter(standing)) {
    const top = topOf(surface)
    if (Math.hypot(point.x - top.x, point.z - top.z) < surface.radius &&
        (best === null || top.y > best)) {
      best = top.y
    }
  }
  return best
}

export function step () {
  for (const surface of surfaces) {
    const stands = standing(surface)
    if (stands) {
      const top = topOf(surface)
      surface.body.position.set(top.x, top.y - THICKNESS / 2, top.z)
      surface.body.quaternion.copy(surface.object.quaternion)
    }
    if (stands !== surface.inWorld) {
      world[stands ? 'addBody' : 'removeBody'](surface.body)
      surface.inWorld = stands
    }
  }
  world.fixedStep()
}
