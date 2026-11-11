// Close-up of the watch on the raised left wrist:
// node scripts/emulator.mjs tests/watch.mjs (screenshots in /tmp/scen)
export const query = ''

export default async function (page) {
  (await import('fs')).mkdirSync('/tmp/scen', {recursive: true})
  await page.enterVR()
  await page.head([0, 1.6, 0], [-35, 0, 0])
  await page.hand('left', [-0.02, 1.38, -0.22], [0, -60, -90])
  await page.hand('right', [0.3, 1.0, 0], [0, 0, 0])
  await page.wait(1500)
  await page.shot('/tmp/scen/watch1.png')
  await page.hand('left', [-0.02, 1.38, -0.22], [20, -20, -60])
  await page.wait(500)
  await page.shot('/tmp/scen/watch2.png')
}
