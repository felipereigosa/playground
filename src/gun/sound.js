import * as THREE from 'three'
import * as player from '../player.js'

// The blaster's shot, made here rather than recorded: a bright tone diving
// from about 1.6 kHz to 180 Hz with a fast wobble on it (the "pew"), a short
// burst of hissing noise for the crack, and a low falling thump for weight.
// A few takes with a slightly different pitch and wobble, so a burst of fire
// doesn't sound like one sample on repeat.
const LENGTH = 0.32         // seconds
const TAKES = 4
const VOICES = 6            // shots that can ring over each other

function take (context, seed) {
  const rate = context.sampleRate
  const n = Math.floor(LENGTH * rate)
  const buffer = context.createBuffer(1, n, rate)
  const out = buffer.getChannelData(0)
  let random = seed * 9301 + 49297
  const noise = () => {
    random = (random * 9301 + 49297) % 233280
    return random / 116640 - 1
  }
  const top = 1600 * (0.92 + 0.05 * seed)
  const bottom = 180
  const wobble = 38 + 6 * seed
  let phase = 0
  let thumpPhase = 0
  let hiss = 0
  let last = 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    const t = i / rate
    // The dive, plus a wobble that fades as it falls
    const f = bottom + (top - bottom) * Math.exp(-t / 0.045)
    const vibrato = 1 + 0.06 * Math.exp(-t / 0.08) * Math.sin(2 * Math.PI * wobble * t)
    phase += 2 * Math.PI * f * vibrato / rate
    const tone = Math.tanh(1.8 * (Math.sin(phase) + 0.4 * Math.sin(2 * phase + 0.7)))
    const toneEnv = Math.min(t / 0.002, 1) * Math.exp(-t / 0.075)
    // The crack: high-passed noise, very short
    const white = noise()
    hiss = 0.85 * (hiss + white - last)
    last = white
    const hissEnv = Math.exp(-t / 0.012)
    // The thump
    thumpPhase += 2 * Math.PI * (45 + 110 * Math.exp(-t / 0.03)) / rate
    const thumpEnv = Math.min(t / 0.003, 1) * Math.exp(-t / 0.05)
    const fadeOut = Math.min((LENGTH - t) / 0.03, 1)
    out[i] = (0.55 * tone * toneEnv + 0.35 * hiss * hissEnv + 0.6 * Math.sin(thumpPhase) * thumpEnv) * fadeOut
    peak = Math.max(peak, Math.abs(out[i]))
  }
  for (let i = 0; i < n; i++) {
    out[i] *= 0.8 / peak
  }
  return buffer
}

// Sound sources riding on an object (the muzzle), heard from where it is
export function shots (object) {
  const listener = player.getListener()
  const takes = Array.from({length: TAKES}, (_, i) => take(listener.context, i))
  const voices = Array.from({length: VOICES}, () => {
    const voice = new THREE.PositionalAudio(listener)
    voice.setRefDistance(0.6)
    voice.setVolume(0.7)
    object.add(voice)
    return voice
  })
  let next = 0
  return function play () {
    const voice = voices[next]
    next = (next + 1) % VOICES
    if (voice.isPlaying) {
      voice.stop()
    }
    voice.setBuffer(takes[Math.floor(Math.random() * TAKES)])
    voice.setPlaybackRate(0.96 + 0.08 * Math.random())
    voice.play()
  }
}
