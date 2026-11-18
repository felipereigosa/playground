# Playground

A personal VR world that runs in the browser of a Meta Quest: an empty room
and a watch on your left wrist. Tap the watch and a menu of gadgets floats in
front of you; grab one and it grows to full size where you let it go.

**Try it in the Quest's browser: https://felipereigosa.com/playground**

## The gadgets

- **Blaster**, two halves held with both hands, firing bolts while the
  trigger is held, and a set of **targets** to shoot at.
- **Bowling**, a ball and ten pins on a lane that counts the pins, clears
  the ones that fell and racks them up again by itself.
- **Radio**, switched on by its button and tuned with a dial. The antenna
  swings and pulls out, and there is static between the stations.
- **Lego**, giant bricks that snap together.
- **Cube**, a Rubik's cube that turns face by face.
- **Tiles**, a sliding tiles puzzle.
- **Calculator**, with keys that press in and work.
- **Table**, to put things on.

Everything can be picked up, carried, thrown and put back on the menu. With
hand tracking, a fist grabs and a pointing finger presses buttons.

## Controls

| | |
|---|---|
| Grip | grab |
| Trigger | use what you hold (fire the blaster) |
| Left stick | walk |
| Right stick, sideways | turn |
| Right stick, down or up | crouch or rise, for things on the floor |
| Fingertip on the watch | open and close the menu |
| Left X | line the room up with your head (for playing lying down) |

## Running it yourself

```
npm install
npm start
```

serves it on port 8300 over https, which WebXR needs on anything but
localhost. Put a certificate for your machine's address in `cert.pem` and
`key.pem` (a self-signed one is fine; the Quest's browser asks once), or set
`HTTP=1` for plain http. Then open `https://<your machine>:8300` in the
Quest's browser.

`?emulate` in the address runs it on a desktop browser with an emulated
headset (IWER); `scripts/emulator.mjs` and `tests/` drive that from Node.

## How it is built

three.js and WebXR, cannon-es for physics, no game engine. Each gadget is a
module in `src/` that is loaded when it is summoned; `src/gadgets.js`
describes what a module exports. Models are glTF files in `assets/`, most of
them modelled by me in Blender; their `.blend` sources and the scripts
that export them are in `resources/` and `scripts/`. Sounds like the tuning
whistle, the static and the knock of the pins are made in code.

## How it was made

Some of it is older work I wrote by myself: the Lego, the cube, the tiles
and the calculator. I built the rest with Claude: I directed and judged,
Claude wrote most of the code, and I modelled most of the 3D assets, sometimes
from ChatGPT concept art. `conversations/` has those sessions, my prompts
and Claude's replies, in order.

## Credits

- Radio music: "Lobby Time", "Local Forecast - Elevator", "Hep Cats",
  "Gymnopedie No. 1" and "Maple Leaf Rag" by Kevin MacLeod
  (incompetech.com), licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Details in
  `assets/radio/music/CREDITS.md`.
- [three.js](https://threejs.org) (MIT), [cannon-es](https://github.com/pmndrs/cannon-es)
  (MIT), [three-to-cannon](https://github.com/donmccurdy/three-to-cannon)
  (MIT), [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime)
  (MIT).

## License

The code is under the GNU General Public License v3.0, see `LICENSE`. The
music keeps its own licence, above.
