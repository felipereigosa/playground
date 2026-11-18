// Opens the snapshot "test1" (see tests/thumbnail.mjs) in the viewer and
// shoots it: node scripts/emulator.mjs tests/snapshot-view.mjs
export const query = 'snapshot=test1'
export const size = [1920, 1080]

export default async function (page) {
  await page.wait(3000)
  await page.shot('/tmp/thumb/view.png')
}
