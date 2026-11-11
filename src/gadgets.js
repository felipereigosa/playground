// Every gadget that can be summoned from the watch. The module is only loaded
// when the gadget is summoned; the menu shows a small copy of its model, the
// object named `root` in `model` (the first object in it when not given),
// turned by `menuTurn` (degrees about x, y, z) so its face points at you.
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
export const gadgets = [
  {
    name: 'calculator',
    label: 'Calculator',
    model: 'calculator/calculator.glb',
    root: 'base',
    menuTurn: [90, 0, 0],
    load: () => import('./calculator/calculator.js'),
  },
  {
    name: 'tiles',
    label: 'Tiles',
    model: 'tiles/tiles.glb',
    root: 'box',
    menuTurn: [90, 0, 0],
    load: () => import('./tiles/tiles.js'),
  },
  {
    name: 'cube',
    label: 'Cube',
    model: 'cube/cube.glb',
    load: () => import('./cube/cube.js'),
  },
]

export function find (name) {
  return gadgets.find(gadget => gadget.name === name)
}
