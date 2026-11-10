import * as THREE from 'three'

export const toRadians = THREE.MathUtils.degToRad
export const toDegrees = THREE.MathUtils.radToDeg

export function within (value, min, max) {
  if (value < min) {
    return min
  } else if (value > max) {
    return max
  } else {
    return value
  }
}

export function rotatePoint (point, pivot, angle) {
  const cos = Math.cos(degToRad(-angle))
  const sin = Math.sin(degToRad(-angle))
  const x = point.x - pivot.x
  const z = point.z - pivot.z
  point.x = x * cos - z * sin + pivot.x
  point.z = x * sin + z * cos + pivot.z
}

export function signedAngle(v1, v2, axis) {
  const v1p = v1.clone().projectOnPlane(axis)
  const v2p = v2.clone().projectOnPlane(axis)
  const cross = new THREE.Vector3()
  cross.crossVectors(v1p, v2p)
  let angle = v1p.angleTo(v2p)
  if (cross.dot(axis) < 0) {
    angle = -angle
  }
  return toDegrees(angle)
}

export function isInsideObject (object, position) {
  if (object.geometry && !object.background) {
    const raycaster = new THREE.Raycaster()
    const direction = new THREE.Vector3(1, 0, 0)
    object.updateMatrixWorld()
    raycaster.set(position, direction)
    object.material.side = THREE.DoubleSide
    return (raycaster.intersectObject(object).length % 2) === 1
  }
  return false
}

// The object whose collision mesh contains the position: the mesh's parent.
// Only meshes named collision* (hidden boxes made in Blender) are tested.
export function getObjectAt (position) {
  let result = null
  scene.traverse(object => {
    if (!result && object.name.startsWith('collision') &&
        isInsideObject(object, position)) {
      result = object.parent
    }
  })
  return result
}

export function clone(source) {
  const sourceLookup = new Map()
  const cloneLookup = new Map()
  const clone = source.clone()

  const parallelTraverse = (a, b, callback) => {
    callback(a, b)
    for (let i = 0; i < a.children.length; i++) {
      parallelTraverse(a.children[i], b.children[i], callback)
    }
  }

  parallelTraverse(source, clone, function (sourceNode, clonedNode) {
    sourceLookup.set(clonedNode, sourceNode)
    cloneLookup.set(sourceNode, clonedNode)
  })

  clone.traverse(function (node) {
    if (!node.isSkinnedMesh) return
    const clonedMesh = node
    const sourceMesh = sourceLookup.get(node)
    const sourceBones = sourceMesh.skeleton.bones

    clonedMesh.skeleton = sourceMesh.skeleton.clone()
    clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix)
    clonedMesh.skeleton.bones = sourceBones.map(function (bone) {
      return cloneLookup.get(bone)
    })

    clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix)
  })

  return clone
}

export function pulse (hand, strength, duration) {
  let actuator = avatar.controllers[hand].actuator

  if (actuator) {
    actuator.pulse(strength, duration)
  }
}

export function aa2q ([x, y, z, angle]) {
  return new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(x, y, z), toRadians(angle))
}

export function getQuaternion (m, q) {
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  m.decompose(position, q, scale)
}

export function closestPointOnLine(a, b, c) {
  const direction = new THREE.Vector3().copy(b).sub(a).normalize();
  const vectorAC = new THREE.Vector3().copy(c).sub(a);
  const distanceAlongLine = vectorAC.dot(direction);
  if (distanceAlongLine < 0) return a
  if (distanceAlongLine > a.distanceTo(b)) return b
  const closestPoint = new THREE.Vector3()
        .copy(direction)
        .multiplyScalar(distanceAlongLine)
        .add(a);
  return closestPoint;
}

export function findChild (object, prefix) {
  for (let child of object.children) {
    if (child.name.startsWith(prefix)) {
      return child
    }
  }
}

export function axisAlignedVector (vector) {
  const array = vector.toArray()
  const absArray = array.map(Math.abs)
  const index = absArray.indexOf(Math.max(...absArray))

  const axis = [0, 0, 0]
  axis[index] = 1 * Math.sign(array[index])

  return new THREE.Vector3(...axis)
}

export function transferChild (object, oldParent, newParent) {
  scene.updateMatrixWorld(true)
  const relativeTransform =
        new THREE.Matrix4()
        .copy(newParent.matrixWorld)
        .invert()
        .multiply(object.matrixWorld)
  relativeTransform.decompose(object.position, object.quaternion, object.scale)
  newParent.add(object)
}

export function printMatrix (matrix) {
  for (let i = 0; i < 4; i++) {
    let row = ''
    for (let j = 0; j < 4; j++) {
      row += matrix.elements[i * 4 + j].toFixed(2) + ' '
    }
    console.log(row)
  }
}

export function hideCollisionMeshes (object) {
  object.traverse((child) => {
    if (child.name.startsWith('collision')) {
      child.visible = false
    }
  })
}
