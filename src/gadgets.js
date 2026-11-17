// Every gadget that can be summoned from the watch. The module is only loaded
// when the gadget is summoned; the menu shows a small copy of its model, the
// object named `root` in `model` (the first object in it when not given, the
// whole file with `whole`). `model` is only used for that copy, so it can be
// a file made just to be the icon (the Lego one);
// turned by `menuTurn` (degrees about x, y, z) so its face points at you,
// and made `menuScale` times its usual menu size, to even the icons out by
// eye.
//
// A gadget module exports:
//   create()                 builds the gadget, returns its root object
//   dispose()                undoes create: timers, textures, state
//   update()                 every frame
//   grabPressed(side, hit)   a grab on one of its parts, see grab.js;
//                            returns true when it takes it
//   grabReleased(side)       the end of a grab it took
//   buttonPressed(side, button), buttonReleased(side, button)
//                            the other buttons of a hand that holds it or
//                            works one of its parts
// all optional but create. The root needs a child mesh named collision*
// (hidden), the part of it a hand picks it up by.
//
// How it comes to rest when let go (world.js), also exported by the module:
//   falls = true             it drops and tumbles, thrown with the hand's speed
//   stands = true            it stands itself up on the floor under it
//   rest = {up, top, tilt}   how it lies on a surface: its axis `up` upwards,
//                            then the end along `top` raised by `tilt` degrees
// Without falls or stands it stays in the air where it is let go, unless
// that is over a surface (the table), which it then comes down to rest on,
// by default on the side that was nearest to facing down.
//
// A set (targets, bricks) is a gadget of loose parts: its root is only its
// icon, and its module also exports
//   deploy(position, facing) puts the parts in the world (children of the
//                            scene), for an icon let go at `position` by
//                            someone looking along `facing` (level)
//   parts()                  the loose parts in the world now; each carries
//                            userData.gadget = the gadget's name, so grabs
//                            on it reach grabPressed
//   stow()                   takes the parts out of the world again
// world.js flies the parts out of the icon and back into it. An entry with
// `icon` (a function returning an object) instead of `model` makes its own
// menu copy.
export const gadgets = [
  {
    name: 'calculator',
    label: 'Calculator',
    model: 'calculator/calculator.glb',
    root: 'base',
    menuScale: 1.2,
    load: () => import('./calculator/calculator.js'),
  },
  {
    name: 'tiles',
    label: 'Tiles',
    model: 'tiles/tiles.glb',
    root: 'box',
    load: () => import('./tiles/tiles.js'),
  },
  {
    name: 'cube',
    label: 'Cube',
    model: 'cube/cube.glb',
    load: () => import('./cube/cube.js'),
  },
  {
    name: 'blaster',
    label: 'Blaster',
    model: 'gun/blaster.glb',
    root: 'blaster',
    load: () => import('./gun/blaster.js'),
  },
  {
    name: 'radio',
    label: 'Radio',
    model: 'radio/radio.glb',
    root: 'radio',
    menuTurn: [0, 180, 0],
    load: () => import('./radio/radio.js'),
  },
  {
    name: 'table',
    label: 'Table',
    menuTurn: [18, 0, 0],      // tipped, or its copy would not be seen to turn
    icon: async () => (await import('./table/table.js')).make(),
    load: () => import('./table/table.js'),
  },
  {
    name: 'targets',
    label: 'Targets',
    model: 'targets/target.glb',
    load: () => import('./targets/targets.js'),
  },
  {
    name: 'lego',
    label: 'Lego',
    model: 'lego/icon.glb',
    whole: true,
    load: () => import('./lego/lego.js'),
  },
]

export function find (name) {
  return gadgets.find(gadget => gadget.name === name)
}
