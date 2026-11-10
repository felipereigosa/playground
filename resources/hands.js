
module.hot.accept('./world', function () {})

import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

let scene, camera, renderer, controller1, controller2;

export function buttonPressed (side, button) {
}

export function buttonReleased (side, button) {
}

function init() {
  // Create scene
  scene = new THREE.Scene();

  // Create camera
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 6);

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // // Add VR button
  // document.body.appendChild(VRButton.createButton(renderer));

  document.body.appendChild(VRButton.createButton(renderer, {
    optionalFeatures: [ 'local-floor', 'bounded-floor', 'hand-tracking' ],
    requiredFeatures: []
  }));

  // Add light
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  // // Add a simple cube
  // const geometry = new THREE.BoxGeometry(1, 1, 1);
  // const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  // const cube = new THREE.Mesh(geometry, material);
  // scene.add(cube);

  // Add a sphere mesh
  const sphereGeometry = new THREE.SphereGeometry(0.01, 32, 32);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.set(0, 1, 0);
  scene.add(sphere);

  // Add a cube to track the palm of the hand
  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.scale.setScalar(0.02);
  scene.add(cube);

  // Set up hand tracking
  controller1 = renderer.xr.getController(0);
  scene.add(controller1);
  controller2 = renderer.xr.getController(1);
  scene.add(controller2);

  const handModelFactory = new XRHandModelFactory();

  const hand1 = renderer.xr.getHand(0);
  hand1.add(handModelFactory.createHandModel(hand1));
  scene.add(hand1);

  const hand2 = renderer.xr.getHand(1);
  hand2.add(handModelFactory.createHandModel(hand2));
  scene.add(hand2);

  // Render loop
  renderer.setAnimationLoop(() => {
    // cube.rotation.x += 0.01;
    // cube.rotation.y += 0.01;

    // Update sphere position to match the tip of the left hand's index finger
    if (hand1.joints['index-finger-tip']) {
      const indexTipPosition = hand1.joints['index-finger-tip'].position;
      sphere.position.copy(indexTipPosition);
    }

    // Update cube position to match the palm of the left hand
    if (hand1.joints['middle-finger-phalanx-proximal']) {
      const palmPosition = hand1.joints['middle-finger-phalanx-proximal'].position;
      const palmRotation = hand1.joints['middle-finger-phalanx-proximal'].rotation;
      cube.position.copy(palmPosition);
      cube.rotation.set(palmRotation.x, palmRotation.y, palmRotation.z);
    }

    renderer.render(scene, camera);
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

init();
