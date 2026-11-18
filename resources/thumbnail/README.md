# How the thumbnail was made

`final.png` here is the thumbnail of the release video (2026-11-18). It is a
real scene from the headset, posed and framed afterwards on the laptop. What
did not work first: a scene staged in the emulator (stiff hands in made-up
positions) and the Quest's own screenshot (a Meta logo in the middle, the
shortcut takes the hands away from the pose, and the menu is too near the
head to fit).

The machinery is `src/snapshot.js`; its header lists every control. Taking
snapshots is off unless switched on, the rest is always there.

## Steps

All commands run on the Linode in `~/playground`, with `npm start` running on
the laptop and the Quest on its adb.

1. Switch capture on (it stays on over reloads):

       scripts/quest.sh
       node scripts/quest-eval.mjs 'localStorage.capture = 1'

2. In the headset: open the menu, pose, press either trigger. Two buzzes mean
   it is saved. The trigger does nothing else while capture is on (no shots
   from the blaster). Only the last three are kept, and a reload of the page
   loses them. The pose need not fit the view: the framing comes later.

3. Bring them over, all at once (a new file in `assets` reloads the page in
   the headset, which empties its list):

       node scripts/snapshot-pull.mjs pose      # assets/snapshots/pose1.json ...

4. Open one on the laptop, `https://localhost:8300/?snapshot=pose1`, or in
   the test Chromium, in a background tab:

       node scripts/snapshot-open.mjs pose1

5. Frame it with the mouse. With Shift held the mouse poses the hand, or
   turns the menu icon, nearest the pointer: left drag turns, the wheel rolls
   a hand about its forearm, right drag moves it, middle drag brings it
   nearer. There is no undo and a reload starts over.

6. Save: `P` in the page (to Downloads), or from here

       node scripts/snapshot-open.mjs --save /tmp/thumbnail.png

7. Switch capture off:

       node scripts/quest-eval.mjs 'delete localStorage.capture'

## What made this one good

- The watch in the picture, its face towards the camera: it is what explains
  the menu. In the pose it was out of sight, so the left hand was rolled half
  a turn about the forearm and brought nearer.
- Each icon on its good side (the blaster in profile, the radio's front, the
  Lego's studs). They spin, so a snapshot catches them anywhere.
- A view from above and to the side of the head's, both rows in the frame.
- No text in the picture.

`thumbnail-edits.json` has the camera, both hands and the icons' angles of
the final frame, over the snapshot `pose2` (snapshots are not in git: about
15 MB each).
