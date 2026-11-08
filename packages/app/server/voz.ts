/**
 * Voz limpia y pareja: quita el ruido y NIVELA la voz para que suene igual de fuerte de principio a fin, también DENTRO de cada clip.
 *
 * Por qué no un compresor/normalizador de ffmpeg (dynaudnorm…): arrancan "en frío" (el primer clip subía de volumen poco a poco: medido +11 a +14 dB
 * entre los primeros 5 s y el resto), bombean en las pausas y quedan distintos al cortar el video. Aquí el nivelado es "offline" y centrado (mira
 * hacia adelante y hacia atrás), así que no hay rampa de arranque y cada frase queda en el mismo nivel:
 *   1) piso de ruido del audio original → filtro de ruido con ese piso fijo (sin periodo de aprendizaje);
 *   2) en cada cuadro de 20 ms se mide el nivel y se decide si hay voz (relativo al piso de ruido);
 *   3) el nivel de cada instante = promedio de los cuadros CON VOZ en ±0,2 s; la ganancia lleva ese nivel al objetivo (en las pausas no sube el ruido);
 *   4) tope de picos (-2,5 dBFS) con mínimo móvil + suavizado, para no saturar NUNCA; un limitador final de seguridad (sin "auto level").
 * Medido en el material de Naty: variación del nivel de voz 1,94 → 0,84 dB, primeros 5 s vs resto +0,6 dB (antes +11 a +14), pico ≤ -3 dBFS.
 */
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const SR = 48000, FR = 960                      // 960 muestras a 48 kHz = 20 ms
export const VOZ_OBJETIVO_DB = -16              // nivel de la voz (RMS de los cuadros con voz)
const PICO = 0.75                               // tope de pico por ganancia (-2,5 dBFS)
const VENTANA = 10                              // ±10 cuadros = ±0,2 s

function run(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args), out: Buffer[] = []; let err = ''
    p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => { err += d }); p.on('error', reject)
    p.on('close', c => c === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.slice(-300))))
  })
}
const floats = (b: Buffer) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)))
const percentile = (a: ArrayLike<number>, q: number) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))] ?? 0 }

/** Lee un archivo f32le estéreo por cuadros de 20 ms. */
async function porCuadros(file: string, cb: (frame: Float32Array, k: number) => void | Promise<void>) {
  const bytes = FR * 2 * 4
  let rest: Buffer = Buffer.alloc(0), k = 0
  for await (const chunk of createReadStream(file, { highWaterMark: bytes * 200 })) {
    rest = rest.length ? Buffer.concat([rest, chunk as Buffer]) : chunk as Buffer
    let off = 0
    while (rest.length - off >= bytes) {
      const b = rest.subarray(off, off + bytes)
      await cb(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + bytes)), k++); off += bytes
    }
    rest = rest.subarray(off)
  }
  if (rest.length >= 8) {        // último cuadro incompleto: se rellena con ceros
    const b = Buffer.alloc(bytes); rest.copy(b)
    await cb(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + bytes)), k++)
  }
  return k
}

/** Curva de ganancia (lineal, una por cuadro de 20 ms) a partir del nivel (dB) y el pico de cada cuadro. */
export function curvaDeGanancia(L: Float64Array, pk: Float64Array, objetivoDb = VOZ_OBJETIVO_DB): Float64Array {
  const n = L.length
  if (!n) return new Float64Array(0)
  const thr = Math.max(percentile(L, 0.1) + 11, -52)
  let voz = Array.from(L, v => v > thr)
  const limpia = (minRun: number, maxGap: number) => {           // quita ráfagas de <80 ms y rellena huecos de <120 ms
    for (let i = 0; i < n;) {
      let j = i; while (j < n && voz[j] === voz[i]) j++
      if (voz[i] && j - i < minRun) for (let q = i; q < j; q++) voz[q] = false
      else if (!voz[i] && j - i < maxGap && i > 0 && j < n) for (let q = i; q < j; q++) voz[q] = true
      i = j
    }
  }
  limpia(4, 6)
  const g = new Float64Array(n).fill(NaN)
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0
    for (let q = Math.max(0, i - VENTANA); q <= Math.min(n - 1, i + VENTANA); q++) if (voz[q]) { s += L[q]; c++ }
    if (c >= 3) g[i] = Math.min(20, Math.max(-15, objetivoDb - s / c))
  }
  const prev = new Int32Array(n).fill(-1), next = new Int32Array(n).fill(-1)
  for (let i = 0, last = -1; i < n; i++) { if (!Number.isNaN(g[i])) last = i; prev[i] = last }
  for (let i = n - 1, last = -1; i >= 0; i--) { if (!Number.isNaN(g[i])) last = i; next[i] = last }
  const gl = new Float64Array(n)
  if (prev[n - 1] < 0) return gl.fill(1)             // sin voz en todo el audio: no se toca el nivel
  for (let i = 0; i < n; i++) {        // pausas: interpola entre la voz de antes y la de después; sin subir el ruido (tope +4 dB)
    let v = g[i]
    if (Number.isNaN(v)) {
      const p = prev[i] >= 0 ? prev[i] : next[i], b = next[i] >= 0 ? next[i] : prev[i]
      v = b === p ? g[b] : g[p] + (g[b] - g[p]) * (i - p) / (b - p)
    }
    if (!voz[i]) v = Math.min(v, 4)
    gl[i] = Math.min(Math.pow(10, v / 20), PICO / Math.max(pk[i], 1e-6))
  }
  const mn = new Float64Array(n)       // mínimo móvil ±5 y suavizado hann de 9: el suavizado no supera al mínimo, así no se pasa del tope de pico
  for (let i = 0; i < n; i++) { let m = Infinity; for (let q = Math.max(0, i - 5); q <= Math.min(n - 1, i + 5); q++) m = Math.min(m, gl[q]); mn[i] = m }
  const hann = Array.from({ length: 9 }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 1)) / 10)), hs = hann.reduce((a, b) => a + b, 0)
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) { let s = 0; for (let q = 0; q < 9; q++) s += hann[q] * mn[Math.min(n - 1, Math.max(0, i + q - 4))]; out[i] = s / hs }
  return out
}

/** Procesa `src` (video o audio) y deja la voz limpia y pareja en `dst` (m4a, mismo reloj que el original). */
export async function nivelarVoz(src: string, dst: string) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'gojaguar-voz-'))
  try {
    // 1) piso de ruido del original
    const a = floats(await run(['-v', 'error', '-i', src, '-vn', '-f', 'f32le', '-ac', '1', '-ar', '16000', '-']))
    const nf16 = Math.floor(a.length / 320), L16 = new Float64Array(nf16)
    for (let i = 0; i < nf16; i++) { let s = 0; for (let j = i * 320; j < i * 320 + 320; j++) s += a[j] * a[j]; L16[i] = 20 * Math.log10(Math.sqrt(s / 320) + 1e-9) }
    const piso = Math.min(-30, Math.max(-60, percentile(L16, 0.1))), nf = Math.round(Math.min(-30, Math.max(-70, piso - 2)))
    // 2) filtro de ruido con piso fijo (sin aprendizaje: no hay rampa al inicio). `atrim` quita los ~30 ms de retraso del filtro.
    const den = path.join(tmp, 'den.f32')
    await run(['-v', 'error', '-y', '-i', src, '-vn', '-ac', '2', '-ar', String(SR), '-af', `highpass=f=80,afftdn=nr=16:nf=${nf}:tn=0,atrim=start=0.03,asetpts=PTS-STARTPTS,apad=pad_dur=0.03`, '-f', 'f32le', den])
    // 3) nivel y pico por cuadro
    const Ls: number[] = [], Ps: number[] = []
    await porCuadros(den, f => {
      let s = 0, p = 0
      for (let i = 0; i < f.length; i += 2) { const m = (f[i] + f[i + 1]) / 2; s += m * m; p = Math.max(p, Math.abs(f[i]), Math.abs(f[i + 1])) }
      Ls.push(20 * Math.log10(Math.sqrt(s / FR) + 1e-9)); Ps.push(p)
    })
    const gs = curvaDeGanancia(Float64Array.from(Ls), Float64Array.from(Ps))
    // 4) aplicar la ganancia muestra a muestra (interpolada entre centros de cuadro) y codificar
    await new Promise<void>((resolve, reject) => {
      const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0', '-af', 'alimiter=limit=0.8:attack=3:release=40:level=0', '-c:a', 'aac', '-b:a', '192k', '-f', 'mp4', dst])
      let err = ''; p.stderr.on('data', d => { err += d }); p.on('error', reject)
      p.on('close', c => c === 0 ? resolve() : reject(new Error(err.slice(-300))))
      void (async () => {
        try {
          await porCuadros(den, async (f, k) => {
            const o = new Float32Array(f.length)
            for (let i = 0; i < FR; i++) {
              const pos = k + (i + 0.5) / FR - 0.5, k0 = Math.floor(pos), fr = pos - k0
              const g = gs[Math.min(gs.length - 1, Math.max(0, k0))] * (1 - fr) + gs[Math.min(gs.length - 1, Math.max(0, k0 + 1))] * fr
              o[2 * i] = f[2 * i] * g; o[2 * i + 1] = f[2 * i + 1] * g
            }
            if (!p.stdin.write(Buffer.from(o.buffer))) await new Promise<void>(r => p.stdin.once('drain', () => r()))
          })
          p.stdin.end()
        } catch (e) { p.stdin.destroy(); reject(e as Error) }
      })()
    })
  } finally { await fsp.rm(tmp, { recursive: true, force: true }) }
}
