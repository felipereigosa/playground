import * as THREE from 'three'
import * as player from '../player.js'

// What the radio plays, heard from its speaker. Each station is a file that
// loops, streamed while the needle is near it and placed in time by the
// clock, as if it had been on the air all along. Between stations there is
// static, made here: noise with a crackle, and the falling whistle of a set
// being tuned in. The music goes through a filter that leaves it what a
// small speaker would.
//
// Stations come from /radio/stations.json (the dev server lists
// assets/radio/music, shipped, and assets/radio/private, yours alone, see
// webpack.config.js): [{file, at}], `at` the number on the dial that began
// the file's name, if any.

const LOCK = 0.012        // of the dial each side of a station where it is clear
const EDGE = 0.05         // and where it is lost in the static
const STATIC = 0.3
const WHISTLE = 0.03
const DIAL = [88, 90, 96, 102, 108, 500, 600, 900]   // the numbers on the strip

let nodes = null
let stations = []         // {file, t, element, gain, playing}

function noise (context) {
  const rate = context.sampleRate
  const buffer = context.createBuffer(1, 3 * rate, rate)
  const out = buffer.getChannelData(0)
  let low = 0
  for (let i = 0; i < out.length; i++) {
    const white = Math.random() * 2 - 1
    low += 0.02 * (white - low)                 // a rumble under the hiss
    const crackle = Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 3 : 0
    out[i] = 0.5 * white + 2.5 * low + crackle
  }
  return buffer
}

// A short click, for the power button
function click (context) {
  const rate = context.sampleRate
  const buffer = context.createBuffer(1, Math.floor(0.03 * rate), rate)
  const out = buffer.getChannelData(0)
  for (let i = 0; i < out.length; i++) {
    const t = i / rate
    out[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.002) + 0.6 * Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / 0.006)
  }
  return buffer
}

// positions: where on the dial (0 to 1) each of its numbers is
export async function create (speaker, positions) {
  const listener = player.getListener()
  const context = listener.context
  const mix = context.createGain()
  const tone = context.createBiquadFilter()     // the small speaker
  tone.type = 'highpass'
  tone.frequency.value = 220
  const top = context.createBiquadFilter()
  top.type = 'lowpass'
  top.frequency.value = 5500
  tone.connect(top).connect(mix)

  const hiss = context.createBufferSource()
  hiss.buffer = noise(context)
  hiss.loop = true
  const hissGain = context.createGain()
  hissGain.gain.value = 0
  hiss.connect(hissGain).connect(tone)
  hiss.start()

  const whistle = context.createOscillator()
  whistle.type = 'sine'
  const whistleGain = context.createGain()
  whistleGain.gain.value = 0
  whistle.connect(whistleGain).connect(tone)
  whistle.start()

  const out = new THREE.PositionalAudio(listener)
  out.setRefDistance(0.8)
  out.setNodeSource(mix)
  out.setVolume(0)
  speaker.add(out)

  const clicks = new THREE.PositionalAudio(listener)
  clicks.setRefDistance(0.5)
  clicks.setBuffer(click(context))
  speaker.add(clicks)

  nodes = {context, mix, tone, top, hiss, hissGain, whistle, whistleGain, out, clicks}

  let list = []
  try {
    list = await (await fetch('radio/stations.json')).json()
  }
  catch (error) {
    console.log('radio: no list of stations, static only')
  }
  if (!nodes) {
    return                // put away meanwhile
  }
  // Those named after a number of the dial go there, the others where there
  // is room, from the left
  const free = DIAL.map((_, i) => i)
  const placed = []
  for (const station of list) {
    const i = DIAL.indexOf(station.at)
    if (i >= 0 && free.includes(i)) {
      free.splice(free.indexOf(i), 1)
      placed.push({...station, slot: i})
    }
  }
  for (const station of list) {
    if (!placed.some(p => p.file === station.file) && free.length) {
      placed.push({...station, slot: free.shift()})
    }
  }
  stations = placed.sort((a, b) => a.slot - b.slot).map(station => ({
    file: station.file, t: positions[station.slot], element: null, gain: null, playing: false,
  }))
}

// Where the stations are on the dial, in order
export function dial () {
  return stations.map(station => station.t)
}

// How clear a station is with the needle at t: 1 on it, 0 away from it
function clarity (station, t) {
  const d = Math.abs(t - station.t)
  return 1 - THREE.MathUtils.smoothstep(d, LOCK, EDGE)
}

// The clearest station at t as {index, clarity}, for the needle's click
export function nearest (t) {
  let best = {index: -1, clarity: 0}
  stations.forEach((station, index) => {
    const c = clarity(station, t)
    if (c > best.clarity) {
      best = {index, clarity: c}
    }
  })
  return best
}

function start (station, index) {
  if (!station.element) {
    const element = new Audio(station.file)
    element.loop = true
    element.preload = 'auto'
    station.element = element
    station.gain = nodes.context.createGain()
    station.gain.gain.value = 0
    nodes.context.createMediaElementSource(element).connect(station.gain).connect(nodes.tone)
  }
  const element = station.element
  // On the air since long ago: where it is now comes from the clock
  const place = () => {
    if (element.duration > 0) {
      element.currentTime = (Date.now() / 1000 + index * 47) % element.duration
    }
  }
  if (element.readyState >= 1) {
    place()
  }
  else {
    element.addEventListener('loadedmetadata', place, {once: true})
  }
  // Passing over a station in a seek stops it before it starts: not an error
  element.play().catch(error => error.name === 'AbortError' || console.log('radio: ' + error.message))
  station.playing = true
}

// Every frame. on: switched on; t: the needle (0 to 1); volume: 0 to 1;
// reception: 0 (antenna down) to 1
export function update (on, t, volume, reception) {
  if (!nodes) {
    return
  }
  const now = nodes.context.currentTime
  const set = (param, value) => param.setTargetAtTime(value, now, 0.03)
  let best = 0
  stations.forEach((station, index) => {
    const c = on ? clarity(station, t) : 0
    best = Math.max(best, c)
    if (c > 0 && !station.playing) {
      start(station, index)
    }
    else if (c === 0 && station.playing) {
      station.element.pause()
      station.playing = false
    }
    if (station.gain) {
      set(station.gain.gain, c * c * (0.5 + 0.5 * reception))
    }
  })
  // A weak signal never quite clears
  const clear = best * (0.55 + 0.45 * reception)
  set(nodes.hissGain.gain, on ? STATIC * (1 - clear) : 0)
  set(nodes.whistleGain.gain, on ? WHISTLE * Math.sin(Math.PI * best) : 0)
  set(nodes.whistle.frequency, 400 + 2600 * (1 - best))
  nodes.out.setVolume(on ? volume * volume * 1.6 : 0)
}

// What is on the air here now, for the tests: [{file, seconds}]
export function playing () {
  return stations.filter(station => station.playing && !station.element.paused)
    .map(station => ({file: station.file, seconds: station.element.currentTime}))
}

export function clickSound () {
  if (nodes) {
    if (nodes.clicks.isPlaying) {
      nodes.clicks.stop()
    }
    nodes.clicks.play()
  }
}

export function dispose () {
  for (const station of stations) {
    station.element?.pause()
    station.gain?.disconnect()
  }
  stations = []
  if (nodes) {
    nodes.hiss.stop()
    nodes.whistle.stop()
    nodes.mix.disconnect()
    nodes.out.removeFromParent()
    nodes.clicks.removeFromParent()
    nodes = null
  }
}
