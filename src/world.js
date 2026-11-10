import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as util from './util.js'

// import * as player from './player.js'
// import * as calculator from './calculator/calculator'
// import * as tiles from './tiles/tiles'
// import * as cube from './cube/cube'

// function resetScene () { //##################### better way to clear hands
//   let toRemove = []
//   scene.traverse(child => {
//     if (!child.background) {
//       toRemove.push(child)
//     }
//   })

//   let rightHand = scene.getObjectByName('right_controller')
//   if (rightHand.held) {
//     rightHand.remove(rightHand.held)
//     rightHand.held = null
//   }

//   let leftHand = scene.getObjectByName('left_controller')
//   if (leftHand.held) {
//     leftHand.remove(leftHand.held)
//     leftHand.held = null
//   }

//   for (let child of rightHand.children) {
//     if (child.name === 'tip') {
//       rightHand.remove(child)
//     }
//   }

//   for (let child of leftHand.children) {
//     if (child.name === 'tip') {
//       leftHand.remove(child)
//     }
//   }

//   for (let child of toRemove) {
//     scene.remove(child)
//   }

//   window.state = {}
// }

// let hours, minutes, seconds

// function setTime () {
//   const time = new Date()

//   hours.rotation.y = -util.toRadians((time.getHours() % 12 + time.getMinutes() / 60) * 30)
//   minutes.rotation.y = -util.toRadians(6 * time.getMinutes())
//   seconds.rotation.y = -util.toRadians(6 * time.getSeconds())
// }

function positionGun () {
  let leftHandle = scene.getObjectByName('left_handle')
  let rightHandle = scene.getObjectByName('right_handle')
  let gunFront = scene.getObjectByName('gun_front')
  let gunBack = scene.getObjectByName('gun_back')

  let x = new THREE.Vector3(-1, 0, 0)
  let y = new THREE.Vector3(0, 1, 0)
  let z = new THREE.Vector3(0, 0, 1)
  let rotation = new THREE.Quaternion().copy(rightHandle.quaternion)

  let leftPosition = new THREE.Vector3()
  let leftRotation = new THREE.Quaternion()
  leftHandle.getWorldPosition(leftPosition)
  leftHandle.getWorldQuaternion(leftRotation)

  let rightPosition = new THREE.Vector3()
  let rightRotation = new THREE.Quaternion()
  rightHandle.getWorldPosition(rightPosition)
  rightHandle.getWorldQuaternion(rightRotation)

  let v = leftPosition.clone().sub(rightPosition)

  y.applyQuaternion(rotation)
  x.applyQuaternion(rotation)
  let angle1 = util.signedAngle(x, v, y)

  y = new THREE.Vector3(0, 1, 0)
  rotation.multiply(new THREE.Quaternion()
                    .setFromAxisAngle(y, util.toRadians(angle1)))

  z = new THREE.Vector3(0, 0, 1)
  z.applyQuaternion(rotation)
  x = new THREE.Vector3(-1, 0, 0)
  x.applyQuaternion(rotation)
  let angle2 = util.signedAngle(x, v, z)

  z = new THREE.Vector3(0, 0, 1)
  rotation.multiply(new THREE.Quaternion()
                    .setFromAxisAngle(z, util.toRadians(angle2)))

  gunBack.position.copy(rightPosition)
  gunBack.quaternion.copy(rotation)

  gunFront.position.copy(rightPosition)
  gunFront.quaternion.copy(rotation)

  gunFront.position.add(v)
}

export async function init () {
  // window.superState = {module: null}
  // resetScene()
  // player.init()

  // if (superState.module) {
  //   superState.module.init()
  // }

  let plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshStandardMaterial({color: '#111'})
  )
  plane.rotation.x = -Math.PI / 2
  scene.add(plane)

  const loader = new GLTFLoader()
  let gltf, collision

  // let gltf = await loader.loadAsync('baked.glb')
  // // // gltf.scene.background = true
  // // // gltf.scene.scale.setScalar(0.8)
  // // scene.add(gltf.scene)

  gltf = await loader.loadAsync('gun/gun.glb');

  let leftHandle = gltf.scene.getObjectByName('left_handle')
  collision = util.findChild(leftHandle, 'collision')
  collision.visible = false
  leftHandle.interactive = true
  let x = Math.random() * 0.5 - 0.1
  let y = Math.random() * 0.2 + 0.8
  let z = Math.random() * 0.2 + 0.8
  leftHandle.position.set(x, y, z)
  let rx = Math.random() * 0.5 + 0.5
  let ry = Math.random() * 0.5 + 0.5
  let rz = Math.random() * 0.5 + 0.5
  leftHandle.rotation.set(rx, ry, rz)
  scene.add(leftHandle)

  let rightHandle = gltf.scene.getObjectByName('right_handle')
  collision = util.findChild(rightHandle, 'collision')
  collision.visible = false
  rightHandle.interactive = true
  let x2 = Math.random() * 0.5 + 0.1
  let y2 = Math.random() * 0.2 + 0.8
  let z2 = Math.random() * 0.2 + 0.8
  rightHandle.position.set(x2, y2, z2)
  let rx2 = Math.random() * 0.5 + 0.5
  let ry2 = Math.random() * 0.5 + 0.5
  let rz2 = Math.random() * 0.5 + 0.5
  rightHandle.rotation.set(rx2, ry2, rz2)
  scene.add(rightHandle)

  let gunBack = gltf.scene.getObjectByName('gun_back')
  scene.add(gunBack)

  let gunFront = gltf.scene.getObjectByName('gun_front')
  scene.add(gunFront)

  // let x = new THREE.Vector3(-1, 0, 0)
  // let y = new THREE.Vector3(0, 1, 0)
  // let z = new THREE.Vector3(0, 0, 1)
  // let rotation = new THREE.Quaternion().copy(rightHandle.quaternion)

  // let v = leftHandle.position.clone().sub(rightHandle.position)

  // y.applyQuaternion(rotation)
  // x.applyQuaternion(rotation)
  // let angle1 = util.signedAngle(x, v, y)

  // y = new THREE.Vector3(0, 1, 0)
  // rotation.multiply(new THREE.Quaternion()
  //                   .setFromAxisAngle(y, util.toRadians(angle1)))

  // z = new THREE.Vector3(0, 0, 1)
  // z.applyQuaternion(rotation)
  // x = new THREE.Vector3(-1, 0, 0)
  // x.applyQuaternion(rotation)
  // let angle2 = util.signedAngle(x, v, z)

  // z = new THREE.Vector3(0, 0, 1)
  // rotation.multiply(new THREE.Quaternion()
  //                   .setFromAxisAngle(z, util.toRadians(angle2)))

  // let gunBack = gltf.scene.getObjectByName('gun_back')
  // scene.add(gunBack)
  // gunBack.position.copy(rightHandle.position)
  // gunBack.quaternion.copy(rotation)

  // let gunFront = gltf.scene.getObjectByName('gun_front')
  // scene.add(gunFront)
  // gunFront.position.copy(rightHandle.position)
  // gunFront.quaternion.copy(rotation)

  // gunFront.position.add(v)

  // let cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
  //                           new THREE.MeshStandardMaterial({color: 'white'}))
  // cube.scale.setScalar(0.02)

  // let obj = gun;

  // let position = new THREE.Vector3()
  // rightSocket.getWorldPosition(position)
  // cube.position.set(position.x, position.y, position.z)

  // scene.add(cube);

  // const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
  //                             new THREE.MeshStandardMaterial({color: 'red'}))
  // scene.add(cube)

  // const loader = new GLTFLoader()
  // let gltf = await loader.loadAsync('environment2.glb')
  // gltf.scene.background = true
  // scene.add(gltf.scene)

  // const clock = scene.getObjectByName('clock')
  // hours = clock.getObjectByName('hours')
  // minutes = clock.getObjectByName('minutes')
  // seconds = clock.getObjectByName('seconds')

  // setTime()
  // setInterval(setTime, 1000)

  // const red = new THREE.Mesh(
  //   new THREE.BoxGeometry(0.1, 0.1, 0.1),
  //   new THREE.MeshStandardMaterial({color: 'red'})
  // )

  // red.position.set(0, 0.5, 3)
  // red.name = 'calculator'
  // red.background = true
  // scene.add(red)

  // const blue = new THREE.Mesh(
  //   new THREE.BoxGeometry(0.1, 0.1, 0.1),
  //   new THREE.MeshStandardMaterial({color: 'blue'})
  // )

  // blue.position.set(1, 0.5, 3)
  // blue.name = 'tiles'
  // blue.background = true
  // scene.add(blue)

  // const yellow = new THREE.Mesh(
  //   new THREE.BoxGeometry(0.1, 0.1, 0.1),
  //   new THREE.MeshStandardMaterial({color: 'yellow'})
  // )

  // yellow.position.set(-1, 0.5, 3)
  // yellow.name = 'cube'
  // yellow.background = true
  // scene.add(yellow)

  // const green = new THREE.Mesh(
  //   new THREE.BoxGeometry(0.1, 0.1, 0.1),
  //   new THREE.MeshStandardMaterial({color: 'green'})
  // )

  // green.position.set(-2, 0.5, 3)
  // green.name = 'cube'
  // green.background = true
  // scene.add(green)

  // // red.visible = false
  // // blue.visible = false
  // // yellow.visible = false

  // superState.icons = [red, blue, yellow, green]

  console.log('world init')
}

// export function mousePressed (event) {
//   // const raycaster = new THREE.Raycaster()
//   // const mouse = new THREE.Vector2()
//   // mouse.x = (event.clientX / window.innerWidth) * 2 - 1
//   // mouse.y = - (event.clientY / window.innerHeight) * 2 + 1
//   // raycaster.setFromCamera(mouse, camera)
//   // const intersects = raycaster.intersectObjects(superState.icons, true)
//   // let module = superState.module
//   // if (intersects.length > 0) {
//   //   if (intersects[0].object.name === 'calculator') {
//   //     module = calculator
//   //   }
//   //   else if (intersects[0].object.name === 'tiles') {
//   //     module = tiles
//   //   }
//   //   else if (intersects[0].object.name === 'cube') {
//   //     module = cube
//   //   }
//   //   resetScene()
//   //   module.init()
//   // }
//   // else {
//   //   if (module?.mousePressed) {
//   //     module?.mousePressed(event)
//   //   }
//   // }

//   console.log('world mousePressed')
// }

// export function mouseReleased (event) {
//   let module = superState.module
//   if (module?.mouseReleased) {
//     module?.mouseReleased(event)
//   }
// }

// export function buttonPressed (hand, button) {
//   let module = superState.module

//   // if (button === 'trigger') {
//   //   resetScene()
//   //   const loader = new GLTFLoader()
//   //   loader.load(environmentName, gltf => {
//   //     scene.add(gltf.scene)
//   //   })
//   //   console.log('fuck you')
//   // }
//   // else

//   if (button === 'grab') {
//     let position = new THREE.Vector3()
//     let controller = scene.getObjectByName(hand + '_controller')
//     let [red, blue, yellow] = superState.icons

//     controller.getWorldPosition(position)

//     if (position.distanceTo(red.position) < 0.05) {
//       module = calculator
//       resetScene()
//       module.init()
//     }
//     else if (position.distanceTo(blue.position) < 0.05) {
//       module = tiles
//       resetScene()
//       module.init()
//     }
//     else if (position.distanceTo(yellow.position) < 0.05) {
//       module = cube
//       resetScene()
//       module.init()
//     }
//   }

//   if (module?.buttonPressed) {
//     module?.buttonPressed(hand, button)
//   }
// }

// export function buttonReleased (hand, button) {
//   let module = superState.module

//   if (module?.buttonReleased) {
//     module?.buttonReleased(hand, button)
//   }
// }

// export function update () {
//   let module = superState.module

//   if (module?.update) {
//     module?.update()
//   }
// }

// let trigger = false
// let grip = false

// export function keyPressed (event) {
//   let module = superState.module

//   if (module?.keyPressed) {

//     if (event.key === 't' && !trigger) {
//       module?.keyPressed(event)
//       trigger = true
//     }

//     if (event.key === 'g' && !grip) {
//       module?.keyPressed(event)
//       grip = true
//     }
//   }
// }

// export function keyReleased (event) {
//   let module = superState.module

//   if (module?.keyPressed) {
//     if (event.key === 't') trigger = false
//     if (event.key === 'g') grip = false
//     module?.keyReleased(event)
//   }
// }

// module.hot.accept('./cube/cube', function () {})


import * as hand from './hand.js'

export function buttonPressed (side, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[side]
    // const otherSide = side === 'left' ? 'right' : 'left'
    // const otherController = avatar.controllers[otherSide]
    const object = util.getObjectAt(hand.getPosition(side))

    if (object) {
        // if (object.parent === otherController) {
        //   otherController.held = null
        //   otherController.remove(object)
        // }

      controller.held = object

      util.transferChild(object, scene, controller)
      object.position.set(0, 0, 0)
      object.rotation.set(2.08, -1.41, -2.99)
      util.pulse(side, 1, 50)

    //   if (object.interactive) {
    //     // if (object.parent === otherController) {
    // //       otherController.held = null
    // //       otherController.remove(object)
    // //     }

    // //     controller.held = object
    // //     util.transferChild(object, scene, controller)
    // //     util.pulse(side, 1, 50)
    //     }
    //     else {
    //       controller.held = object
    //     util.transferChild(object, scene, controller)
    //     util.pulse(side, 1, 50)
    //     let start = object.position.clone()
    //     let end = getFreePoint()
    //     let distance = start.distanceTo(end)

    //     if (distance < 0.3) {
    //       controller.movingTile = {which: object,
    //                                start: object.position.clone(),
    //                                end: getFreePoint(),
    //                                snap: 'start'}
    //     }
    //   }
      // }
    }
  }
}

export function buttonReleased (side, button) {
  if (button === 'grab') {
    const controller = avatar.controllers[side]

    if (controller.held) {
      util.transferChild(controller.held, controller, scene)
      controller.held = null
    }
  }
}

export function update () {
  positionGun()
}
