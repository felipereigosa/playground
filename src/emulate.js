import * as THREE from 'three'
import { XRDevice, metaQuest2 } from 'iwer'
import * as hand from './hand.js'
import * as grab from './grab.js'
import * as world from './world.js'
import * as menu from './menu.js'
import * as hits from './hits.js'

// Testing without the headset: ?emulate in the URL replaces the browser's
// WebXR with Meta's emulator (IWER) pretending to be a Quest 2, so the page
// runs its real VR code in a desktop browser. Headset and controllers are
// then moved and pressed from code through window.xrDevice, see
// scripts/emulator.mjs.
export function install () {
  const device = new XRDevice(metaQuest2, {stereoEnabled: false})
  device.installRuntime({forceInstall: true})
  window.xrDevice = device
  // For the tests to look inside
  Object.assign(window, {THREE, hand, grab, world, menu, hits})
}
