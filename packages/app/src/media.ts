import { createFile, DataStream, MP4BoxBuffer } from 'mp4box'
import type { AssetInfo } from '@gojaguar/core'

interface VSample { data: Uint8Array; sync: boolean; t: number }   // t = instante real del fotograma en segundos (PTS)

/**
 * Decodifica frames sueltos con WebCodecs. El proxy es "todo keyframes",
 * así que cualquier frame se decodifica de forma independiente (scrub instantáneo).
 * Se usa el índice de frame como timestamp para casar salida <-> petición.
 * El instante de cada frame sale de su PTS real (no de índice/fps): si el video tiene huecos o fps variable, el índice se desfasa del audio.
 */
export class FrameSource {
  private decoder: VideoDecoder
  private cache = new Map<number, VideoFrame>()      // LRU: orden de inserción
  private pending = new Map<number, { p: Promise<VideoFrame>; res: (f: VideoFrame) => void }>()
  private cap = 48
  stats = { decoded: 0 }

  constructor(private samples: VSample[], private config: VideoDecoderConfig, private fps: number) {
    this.decoder = new VideoDecoder({
      output: f => this.onFrame(f),
      error: e => console.error('VideoDecoder', e),
    })
    this.decoder.configure(config)
  }

  get frameCount() { return this.samples.length }
  /** Índice del último frame cuyo PTS es ≤ t (búsqueda binaria): así imagen y audio quedan sincronizados aunque falten frames. */
  idxAt(t: number) {
    const ss = this.samples; let lo = 0, hi = ss.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ss[mid].t <= t + 1e-6) lo = mid; else hi = mid - 1 }
    return lo
  }
  peek(idx: number) { return this.cache.get(idx) ?? null }

  private onFrame(f: VideoFrame) {
    const idx = f.timestamp
    this.stats.decoded++
    const waiter = this.pending.get(idx)
    this.pending.delete(idx)
    this.cache.set(idx, f)
    while (this.cache.size > this.cap) {
      const k = this.cache.keys().next().value as number
      this.cache.get(k)?.close()
      this.cache.delete(k)
    }
    waiter?.res(f)
  }

  getFrame(idx: number): Promise<VideoFrame> {
    const hit = this.cache.get(idx)
    if (hit) { this.cache.delete(idx); this.cache.set(idx, hit); return Promise.resolve(hit) }
    const inflight = this.pending.get(idx)
    if (inflight) return inflight.p
    let res!: (f: VideoFrame) => void
    const p = new Promise<VideoFrame>(r => { res = r })
    this.pending.set(idx, { p, res })
    const s = this.samples[idx]
    this.decoder.decode(new EncodedVideoChunk({
      type: s.sync ? 'key' : 'delta', timestamp: idx, data: s.data,
    }))
    // Todo-keyframes: no hay reordenamiento, así que se fuerza la salida de inmediato.
    void this.decoder.flush().catch(() => {})
    return p
  }

  prefetch(from: number, count: number) {
    for (let i = 1; i <= count; i++) {
      const idx = from + i
      if (idx < this.samples.length && !this.cache.has(idx) && !this.pending.has(idx)) void this.getFrame(idx)
    }
  }
}

export class LoadedAsset {
  source!: FrameSource       // vista previa y scrub
  audio: AudioBuffer | null = null
  peaks = new Float32Array(0)   // pico por 1/PEAK_RATE s
  thumbs: ImageBitmap[] = []    // 1 por segundo
  constructor(public info: AssetInfo) {}
}

export const PEAK_RATE = 100
export const THUMB_W = 192, THUMB_H = 108   // miniatura 16:9 (mayor resolución para pantallas retina)

export async function loadAsset(info: AssetInfo, actx: AudioContext, onThumb: () => void): Promise<LoadedAsset> {
  const asset = new LoadedAsset(info)
  const buf = await (await fetch(`/${info.proxy}`)).arrayBuffer()

  // --- demux ---------------------------------------------------------------
  const file = createFile()
  const samples: VSample[] = []
  let config!: VideoDecoderConfig
  let fps = info.fps
  let total = 0
  await new Promise<void>((resolve, reject) => {
    file.onError = (_m, e) => reject(new Error(String(e)))
    file.onReady = movie => {
      const track = movie.videoTracks[0]
      const trak = file.getTrackById(track.id)
      let description: Uint8Array | undefined
      for (const entry of trak.mdia!.minf!.stbl!.stsd!.entries as any[]) {
        const box = entry.avcC ?? entry.hvcC
        if (box) {
          const ds = new DataStream(undefined, 0, 1 as never)
          box.write(ds)
          description = new Uint8Array(ds.buffer as ArrayBuffer, 8)
          break
        }
      }
      config = { codec: track.codec, codedWidth: track.video!.width, codedHeight: track.video!.height, description }
      total = track.nb_samples
      fps = (track.nb_samples * track.timescale) / track.samples_duration
      file.setExtractionOptions(track.id, null, { nbSamples: 1_000_000 })
      file.start()
      file.flush()
    }
    file.onSamples = (_id, _u, ss) => {
      for (const s of ss) samples.push({ data: s.data as Uint8Array, sync: s.is_sync, t: s.cts / s.timescale })
      if (samples.length >= total) resolve()
    }
    file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buf.slice(0), 0))
    file.flush()
  })

  samples.sort((a, b) => a.t - b.t)
  const t0 = samples[0]?.t ?? 0; if (t0) for (const x of samples) x.t -= t0      // el primer frame es el instante 0
  const sup = await VideoDecoder.isConfigSupported(config)
  if (!sup.supported) throw new Error('Códec no soportado: ' + config.codec)
  asset.info = { ...info, fps }
  asset.source = new FrameSource(samples, config, fps)

  // --- audio ---------------------------------------------------------------
  try {
    asset.audio = await actx.decodeAudioData(buf.slice(0))
    const ch = asset.audio.getChannelData(0)
    const step = Math.floor(asset.audio.sampleRate / PEAK_RATE)
    const n = Math.floor(ch.length / step)
    asset.peaks = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let m = 0
      for (let j = i * step, e = j + step; j < e; j += 4) { const v = Math.abs(ch[j]); if (v > m) m = v }
      asset.peaks[i] = m
    }
  } catch (e) { console.warn('sin audio', e) }

  // --- miniaturas (decoder propio para no competir con el scrub) ------------
  void (async () => {
    const thumbSrc = new FrameSource(samples, config, fps)
    for (let s = 0; s < Math.ceil(info.duration); s++) {
      const f = await thumbSrc.getFrame(thumbSrc.idxAt(s))
      // "object-fit: cover": se recorta el centro del frame con la proporción de la miniatura, nunca se estira
      const fw = f.displayWidth || f.codedWidth, fh = f.displayHeight || f.codedHeight, ar = THUMB_W / THUMB_H
      const sw = fw / fh > ar ? fh * ar : fw, sh = fw / fh > ar ? fh : fw / ar
      asset.thumbs[s] = await createImageBitmap(f, Math.round((fw - sw) / 2), Math.round((fh - sh) / 2), Math.round(sw), Math.round(sh), { resizeWidth: THUMB_W, resizeHeight: THUMB_H, resizeQuality: 'medium' })
      if (s % 5 === 0) onThumb()
    }
    onThumb()
  })()

  return asset
}
