/**
 * Análisis de ritmo de una pista (sin dependencias): BPM, cuadrícula de pulsos, golpes fuertes y energía.
 * Pensado para música electrónica / hip hop / trap, donde el tempo es constante.
 * Se usa para cortar, hacer zoom y poner transiciones sobre el ritmo.
 */
import { spawn } from 'node:child_process'

export interface Ritmo {
  bpm: number                 // tempo principal
  bpmAlt: number | null       // el doble o la mitad (trap suele sonar a 70 y 140)
  confianza: number           // 0..1: qué tan marcado es el pulso
  duracion: number            // segundos analizados
  beats: number[]             // tiempos de cada pulso (s)
  golpes: number[]            // los golpes más fuertes (kicks, impactos) en segundos
  energia: number[]           // energía por medio segundo (0..1): sirve para ver dónde sube o cae
}

const SR = 22050, N = 1024, HOP = 256, FPS = SR / HOP
const r2 = (x: number) => Math.round(x * 100) / 100

function decode(file: string, maxSec: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-t', String(maxSec), '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'])
    const chunks: Buffer[] = []
    p.stdout.on('data', c => chunks.push(c))
    p.on('error', reject)
    p.on('close', code => {
      const b = Buffer.concat(chunks)
      if (code !== 0 || b.length < 4 * SR) return reject(new Error('No pude leer el audio'))
      resolve(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)))
    })
  })
}

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
      }
    }
  }
}

/** Envolvente de "inicios de sonido" (flujo espectral), con más peso en graves (los kicks marcan el pulso). */
function onsetEnvelope(x: Float32Array) {
  const frames = Math.max(0, Math.floor((x.length - N) / HOP))
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
  const re = new Float32Array(N), im = new Float32Array(N)
  const bins = 370   // hasta ~8 kHz
  let prev = new Float32Array(bins)
  const env = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = x[f * HOP + i] * win[i]; im[i] = 0 }
    fft(re, im)
    let flux = 0
    const cur = new Float32Array(bins)
    for (let k = 1; k < bins; k++) {
      cur[k] = Math.log1p(60 * Math.hypot(re[k], im[k]) / N)
      const d = cur[k] - prev[k]
      if (d > 0) flux += d * (k < 20 ? 2.2 : 1)
    }
    env[f] = flux; prev = cur
  }
  // quitar la tendencia local y normalizar
  const out = new Float32Array(frames), w = Math.round(FPS * 0.4)
  let sum = 0
  for (let f = 0; f < frames; f++) {
    sum += env[f]; if (f >= 2 * w) sum -= env[f - 2 * w]
    const mean = sum / Math.min(f + 1, 2 * w)
    out[f] = Math.max(0, env[f] - mean)
  }
  const max = out.reduce((m, v) => Math.max(m, v), 1e-9)
  return out.map(v => v / max)
}

function estimateTempo(env: Float32Array) {
  const n = env.length
  const lagMin = Math.floor((FPS * 60) / 200), lagMax = Math.ceil((FPS * 60) / 60)
  const r = new Float32Array(lagMax + 2)
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
    let s = 0
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag]
    r[lag] = s / (n - lag)
  }
  const prior = (bpm: number) => Math.exp(-0.5 * Math.pow(Math.log2(bpm / 125) / 0.85, 2))
  let best = lagMin, bestScore = -1
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const bpm = (FPS * 60) / lag
    const sc = r[lag] * prior(bpm)
    if (sc > bestScore && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { bestScore = sc; best = lag }
  }
  // interpolación parabólica para afinar
  const a = r[best - 1], b = r[best], c = r[best + 1]
  const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0
  let bpm = (FPS * 60) / (best + shift)
  if (Math.abs(bpm - Math.round(bpm)) < 0.3) bpm = Math.round(bpm)
  const mean = r.slice(lagMin, lagMax).reduce((s, v) => s + v, 0) / (lagMax - lagMin)
  const confianza = Math.min(1, Math.max(0, (b / Math.max(mean, 1e-9) - 1) / 4))
  return { bpm, confianza }
}

function trackBeats(env: Float32Array, bpm: number) {
  const T = (FPS * 60) / bpm
  let bestPhase = 0, bestScore = -1
  for (let phase = 0; phase < T; phase += 0.5) {
    let s = 0, n = 0
    for (let t = phase; t < env.length - 1; t += T) { s += env[Math.round(t)]; n++ }
    s /= Math.max(n, 1)
    if (s > bestScore) { bestScore = s; bestPhase = phase }
  }
  const beats: number[] = []
  for (let t = bestPhase; t < env.length; t += T) {
    // se ajusta al pico local (±3 frames) para absorber pequeñas variaciones
    let bi = Math.round(t), bv = -1
    for (let d = -3; d <= 3; d++) { const i = Math.round(t) + d; if (i >= 0 && i < env.length && env[i] > bv) { bv = env[i]; bi = i } }
    beats.push(r2(bi / FPS))
  }
  return beats
}

function strongHits(env: Float32Array) {
  const mean = env.reduce((s, v) => s + v, 0) / env.length
  const sd = Math.sqrt(env.reduce((s, v) => s + (v - mean) ** 2, 0) / env.length)
  const thr = mean + 1.6 * sd, minGap = Math.round(FPS * 0.12)
  const hits: { t: number; v: number }[] = []
  for (let i = 2; i < env.length - 2; i++) {
    if (env[i] > thr && env[i] >= env[i - 1] && env[i] >= env[i + 1] && env[i] >= env[i - 2] && env[i] >= env[i + 2]) {
      const last = hits[hits.length - 1]
      if (last && i - last.t * FPS < minGap) { if (env[i] > last.v) { last.t = i / FPS; last.v = env[i] } }
      else hits.push({ t: i / FPS, v: env[i] })
    }
  }
  return hits.map(h => r2(h.t))
}

function energy(x: Float32Array) {
  const step = Math.round(SR * 0.5), out: number[] = []
  for (let i = 0; i + step <= x.length; i += step) {
    let s = 0; for (let j = i; j < i + step; j++) s += x[j] * x[j]
    out.push(Math.sqrt(s / step))
  }
  const max = Math.max(...out, 1e-9)
  return out.map(v => r2(v / max))
}

export async function analizarRitmo(file: string, maxSec = 240): Promise<Ritmo> {
  const x = await decode(file, maxSec)
  const env = onsetEnvelope(x)
  const { bpm, confianza } = estimateTempo(env)
  const alt = bpm * 2 <= 200 ? bpm * 2 : bpm / 2 >= 60 ? bpm / 2 : null
  return {
    bpm: Math.round(bpm * 10) / 10, bpmAlt: alt ? Math.round(alt * 10) / 10 : null, confianza: r2(confianza),
    duracion: r2(x.length / SR), beats: trackBeats(env, bpm), golpes: strongHits(env), energia: energy(x),
  }
}
