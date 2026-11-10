import * as THREE from 'three'
import { BoxLineGeometry } from 'three/addons/geometries/BoxLineGeometry.js'

// Placeholder surroundings, taken from the claude-bot project: a gradient
// sky, a grey floor and a 12 m grid room, lit by a hemisphere light and a
// sun that casts shadows. To be replaced by real environments later.
export function create () {
  scene.background = new THREE.Color().setHSL(0.6, 0, 1)

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6)
  hemiLight.position.set(0, 50, 0)
  scene.add(hemiLight)

  const sun = new THREE.DirectionalLight(0xffffff, 1)
  sun.color.setHSL(0.1, 1, 0.95)
  sun.position.set(1, 1.75, 0).multiplyScalar(30)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.normalBias = 0.05
  const d = 6
  sun.shadow.camera.left = -d
  sun.shadow.camera.right = d
  sun.shadow.camera.top = d
  sun.shadow.camera.bottom = -d
  sun.shadow.camera.far = 500
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshLambertMaterial({color: 0xaaaaaa})
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  ground.name = 'ground'
  scene.add(ground)

  const room = new THREE.LineSegments(
    new BoxLineGeometry(12, 12, 12, 20, 20, 20),
    new THREE.LineBasicMaterial({color: 0x808080})
  )
  room.geometry.translate(0, 6.001, 0)
  room.name = 'grid'
  scene.add(room)

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 32, 15),
    new THREE.ShaderMaterial({
      uniforms: {
        topColor: {value: new THREE.Color().setHSL(0.6, 1, 0.6)},
        bottomColor: {value: new THREE.Color(0xffffff)},
        offset: {value: 500},
        exponent: {value: 0.6},
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(h, exponent), 0.0)), 1.0);
        }`,
      side: THREE.BackSide,
    })
  )
  sky.name = 'sky'
  scene.add(sky)
}
