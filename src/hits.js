import * as THREE from 'three'

// Things that react to being shot. A gadget registers an object with
// add(object, handler); whatever flies (the blaster's bolts) calls
// cast(from, to, by) for each stretch it covers, and the handler of the first
// registered object on the way gets {point, direction, by}: where it was
// struck (world), which way the shot was going, and the name of what shot.

const handlers = new Map()
const raycaster = new THREE.Raycaster()

export function add (object, handler) {
  handlers.set(object, handler)
}

export function remove (object) {
  handlers.delete(object)
}

// Returns the point struck, or null
export function cast (from, to, by) {
  if (handlers.size === 0) {
    return null
  }
  const direction = to.clone().sub(from)
  raycaster.far = direction.length()
  raycaster.set(from, direction.normalize())
  const found = raycaster.intersectObjects([...handlers.keys()], true)[0]
  if (!found) {
    return null
  }
  let object = found.object
  while (!handlers.has(object)) {
    object = object.parent
  }
  handlers.get(object)({point: found.point, direction, by})
  return found.point
}
