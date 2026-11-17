import * as THREE from 'three'

// The blaster's light: bolts and the muzzle plume, both drawn as streaks: a
// flat strip lying along a line and turned about it to face the eye, so it
// looks round from any side. Their shaders shape the glow (a white-hot core
// inside a cyan haze) instead of any geometry. Normal blending, since
// additive washes out on the bright sky.

const CYAN = new THREE.Color(0x5ff4ff)

// position.x across the strip (-1..1), position.y along it: 0 at uStart,
// 1 at uLength along uDir, a little below 0 for the rounded cap
const vertexShader = `
  uniform vec3 uStart;
  uniform vec3 uDir;
  uniform float uLength;
  uniform float uWidth;
  varying vec2 vUv;
  void main () {
    vUv = position.xy;
    vec3 along = uStart + uDir * (position.y * uLength);
    vec3 toEye = normalize(cameraPosition - along);
    vec3 side = normalize(cross(uDir, toEye));
    vec3 world = along + side * (position.x * uWidth);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const noise = `
  float hash (vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise (vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
`

const output = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

// A bolt: a round white head at uStart and a tail behind it that thins and
// fades, shimmering as it goes
const boltFragment = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uCap;
  varying vec2 vUv;
  ${noise}
  void main () {
    float a = vUv.y;
    float w = mix(1.0, 0.25, clamp(a, 0.0, 1.0));
    vec2 q = vec2(vUv.x / w, a < 0.0 ? a / uCap : 0.0);
    float d = length(q);
    float fade = pow(1.0 - clamp(a, 0.0, 1.0), 1.6);
    float shimmer = 0.75 + 0.5 * noise(vec2(a * 14.0 - uTime * 40.0, vUv.x * 2.0));
    float glow = exp(-d * d * 4.0) * fade * shimmer;
    float core = smoothstep(0.38, 0.1, d) * pow(1.0 - clamp(a, 0.0, 1.0), 0.7);
    vec3 color = mix(uColor, vec3(1.0), core);
    gl_FragColor = vec4(color, clamp(glow * 0.9 + core, 0.0, 1.0));
    ${output}
  }
`

// The plume: a tongue of fire out of the muzzle, broad near it and torn into
// licks further out by noise running outwards; uHeat kicks it at each shot
const plumeFragment = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uHeat;
  varying vec2 vUv;
  ${noise}
  void main () {
    float a = clamp(vUv.y, 0.0, 1.0);
    float n = noise(vec2(a * 5.0 - uTime * 26.0, vUv.x * 2.5 + uTime * 3.0));
    float n2 = noise(vec2(a * 11.0 - uTime * 41.0, vUv.x * 5.0 - uTime * 7.0));
    float w = (0.35 + 0.65 * sqrt(a)) * (1.0 - a * a) * (0.7 + 0.5 * n);
    float d = abs(vUv.x) / max(w, 0.001);
    float body = smoothstep(1.0, 0.2, d) * (1.0 - a) * (0.55 + 0.6 * n2);
    float core = smoothstep(0.5, 0.0, d) * smoothstep(0.55, 0.0, a);
    float alpha = clamp((body * 1.7 + core * 1.3) * uHeat, 0.0, 1.0);
    vec3 color = mix(uColor, vec3(1.0), clamp(core * 1.3 + (1.0 - a) * 0.25, 0.0, 1.0));
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
    ${output}
  }
`

function strip (cap) {
  const geometry = new THREE.PlaneGeometry(2, 1 + cap, 1, 16)
  geometry.translate(0, (1 + cap) / 2 - cap, 0)
  return geometry
}

function material (fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uStart: {value: new THREE.Vector3()},
      uDir: {value: new THREE.Vector3(0, 0, -1)},
      uLength: {value: 1},
      uWidth: {value: 0.01},
      uColor: {value: CYAN},
      uTime: {value: 0},
      ...uniforms,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

function streak (geometry, mat) {
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.frustumCulled = false    // placed by the shader, not by its matrix
  return mesh
}

const BOLT_CAP = 0.12
let boltGeometry = null
let boltMaterial = null

// A bolt flying from a point along a direction (unit vector)
export function bolt () {
  boltGeometry ||= strip(BOLT_CAP)
  boltMaterial ||= material(boltFragment, {uCap: {value: BOLT_CAP}})
  // Each bolt has its own uniforms but shares the compiled program
  return streak(boltGeometry, boltMaterial.clone())
}

// Places a bolt: head at a point, tail behind it
export function placeBolt (mesh, head, direction, length, width, time) {
  const u = mesh.material.uniforms
  u.uStart.value.copy(head)
  u.uDir.value.copy(direction).negate()
  u.uLength.value = length
  u.uWidth.value = width
  u.uTime.value = time
}

export function plume () {
  return streak(strip(0), material(plumeFragment, {uHeat: {value: 0}}))
}

export function placePlume (mesh, from, direction, length, width, heat, time) {
  const u = mesh.material.uniforms
  u.uStart.value.copy(from)
  u.uDir.value.copy(direction)
  u.uLength.value = length
  u.uWidth.value = width
  u.uHeat.value = heat
  u.uTime.value = time
  mesh.visible = heat > 0.01
}

// A camera-facing star at the muzzle: a round glow with four thin rays
let flareTexture = null
export function flare () {
  if (!flareTexture) {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const g = canvas.getContext('2d')
    const c = size / 2
    const glow = g.createRadialGradient(c, c, 0, c, c, c)
    glow.addColorStop(0, 'rgba(255,255,255,1)')
    glow.addColorStop(0.15, 'rgba(220,255,255,0.9)')
    glow.addColorStop(0.4, 'rgba(95,244,255,0.35)')
    glow.addColorStop(1, 'rgba(95,244,255,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, size, size)
    for (const [w, h] of [[size, 3], [3, size]]) {
      const ray = g.createRadialGradient(c, c, 0, c, c, c)
      ray.addColorStop(0, 'rgba(255,255,255,0.9)')
      ray.addColorStop(1, 'rgba(95,244,255,0)')
      g.fillStyle = ray
      g.fillRect(c - w / 2, c - h / 2, w, h)
    }
    flareTexture = new THREE.CanvasTexture(canvas)
    flareTexture.colorSpace = THREE.SRGBColorSpace
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareTexture, transparent: true, depthWrite: false,
  }))
  sprite.visible = false
  return sprite
}
