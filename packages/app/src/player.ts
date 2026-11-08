import type { LoadedAsset } from './media'
import { dibujarAsas, drawOverlays, setOverlayRedraw, type Geom } from './overlays'
import { CLIP_TRANSFORM_DEFAULT, duration, fxAt, layout, locate, overlayEnd, type FxState, type Store } from '@gojaguar/core'
import { H, W, setCanvasSize } from './constants'

/**
 * Motor de vista previa: NO renderiza nada. Cada frame se calcula en vivo:
 * timeline -> (clip, tiempo fuente) -> frame decodificado (WebCodecs) -> canvas.
 * Audio: Web Audio agendado según el timeline (recortes y velocidad en vivo).
 */
export class Player {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly actx = new AudioContext()
  assets = new Map<string, LoadedAsset>()
  /** Audio estirado conservando el tono, por (asset, velocidad). */
  private stretched = new Map<string, AudioBuffer>()
  private computing = new Set<string>()
  private worker = new Worker(new URL('./stretch.worker.ts', import.meta.url), { type: 'module' })
  private stretchTimer = 0
  audioStatus = ''

  playhead = 0
  hover: number | null = null      // scrub con el mouse sobre el timeline
  override: number | null = null   // tiempo forzado (p. ej. mientras se recorta)
  playing = false
  /** Velocidad de reproducción de la vista previa (1, 1,5, 2…): solo al ver; no cambia la edición ni la exportación. El audio sube de tono, como al adelantar. */
  rate = 1
  dirty = true

  private t0 = 0
  private ctxStart = 0
  private nodes: AudioScheduledSourceNode[] = []
  private layer = new OffscreenCanvas(W, H)
  private glitchTmp: OffscreenCanvas | null = null
  /** Tamaño (ya girado) del último fotograma dibujado de la pista principal y de cada video superpuesto: para las asas. */
  private mainDims: { fw: number; fh: number } | null = null
  private ovDims = new Map<string, { fw: number; fh: number }>()
  private layerCtx = this.layer.getContext('2d')!
  /** Música decodificada (por id de asset) y su envolvente para la línea de tiempo. */
  music = new Map<string, AudioBuffer>()
  musicPeaks = new Map<string, Float32Array>()
  private fx: FxState = { zoom: 1, shift: 0, shiftY: 0, glitch: 0, flash: 0 }
  private fxKey = ''
  private sizeKey = ''

  /** Ajusta el lienzo al formato del proyecto. */
  private fit() {
    const f = this.store.project.format, k = `${f.width}x${f.height}`
    if (k === this.sizeKey) return
    this.sizeKey = k
    setCanvasSize(f)
    this.canvas.width = W; this.canvas.height = H
    this.canvas.style.aspectRatio = `${W} / ${H}`
    this.layer = new OffscreenCanvas(W, H); this.layerCtx = this.layer.getContext('2d')!
    this.layerKey = ''; this.dirty = true
  }
  /** Frame actualmente dibujado (asset:índice). Público para el benchmark. */
  layerKey = ''
  private wanted: { asset: LoadedAsset; idx: number; key: string } | null = null
  private pumping = false
  fps = { shown: 0, last: performance.now(), n: 0 }
  onTime: (t: number) => void = () => {}

  constructor(canvas: HTMLCanvasElement, private store: Store) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.fit()
    setOverlayRedraw(() => { this.dirty = true })
    store.onChange(() => {
      this.fit()
      this.playhead = Math.min(this.playhead, duration(store.project))
      if (this.playing) this.scheduleAudio(this.time())
      this.dirty = true
      clearTimeout(this.stretchTimer)
      this.stretchTimer = window.setTimeout(() => this.ensureStretched(), 350)
    })
    this.worker.onmessage = e => this.onStretched(e.data)
  }

  /** Registra la música (ya decodificada) y calcula su envolvente. */
  addMusic(id: string, buf: AudioBuffer) {
    this.music.set(id, buf)
    const ch = buf.getChannelData(0), step = Math.floor(buf.sampleRate / 100), n = Math.floor(ch.length / step), pk = new Float32Array(n)
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step, e = j + step; j < e; j += 8) { const v = Math.abs(ch[j]); if (v > m) m = v } pk[i] = m }
    this.musicPeaks.set(id, pk)
    if (this.playing) this.scheduleAudio(this.time())
    this.dirty = true
  }

  private skey = (assetId: string, speed: number) => `${assetId}@${speed}`
  private jobs = new Map<string, { assetId: string; speed: number; sr: number; t0: number }>()

  /** Prepara (en segundo plano) el audio de cada velocidad usada, sin cambiar el tono. */
  ensureStretched() {
    for (const c of this.store.project.clips) {
      if (c.speed === 1) continue
      const key = this.skey(c.assetId, c.speed)
      const a = this.assets.get(c.assetId)
      if (!a?.audio || this.stretched.has(key) || this.computing.has(key)) continue
      this.computing.add(key)
      const left = a.audio.getChannelData(0).slice()
      const right = (a.audio.numberOfChannels > 1 ? a.audio.getChannelData(1) : a.audio.getChannelData(0)).slice()
      this.jobs.set(key, { assetId: c.assetId, speed: c.speed, sr: a.audio.sampleRate, t0: performance.now() })
      this.audioStatus = `procesando audio ×${c.speed}…`
      this.worker.postMessage({ id: key, left, right, tempo: c.speed }, [left.buffer as ArrayBuffer, right.buffer as ArrayBuffer])
    }
  }

  private onStretched(m: { id: string; progress?: number; left?: Float32Array; right?: Float32Array }) {
    const job = this.jobs.get(m.id)
    if (!job) return
    if (m.progress !== undefined) { this.audioStatus = `procesando audio ×${job.speed}… ${Math.round(m.progress * 100)}%`; return }
    const buf = this.actx.createBuffer(2, m.left!.length, job.sr)
    buf.copyToChannel(m.left as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(m.right as Float32Array<ArrayBuffer>, 1)
    this.stretched.set(m.id, buf)
    this.computing.delete(m.id); this.jobs.delete(m.id)
    this.audioStatus = this.computing.size ? this.audioStatus : `audio ×${job.speed} listo (${((performance.now() - job.t0) / 1000).toFixed(1)}s)`
    if (this.playing) this.scheduleAudio(this.time())
  }

  /** Tiempo que se muestra ahora mismo en la vista previa. */
  time() {
    if (this.playing) return this.t0 + (this.actx.currentTime - this.ctxStart) * this.rate
    return this.override ?? this.hover ?? this.playhead
  }

  seek(t: number) {
    this.playhead = Math.min(Math.max(t, 0), duration(this.store.project))
    if (this.playing) this.scheduleAudio(this.playhead)
    this.dirty = true
    this.onTime(this.playhead)
  }

  async play() {
    const dur = duration(this.store.project)
    if (!dur) return
    await this.actx.resume()
    if (this.playhead >= dur - 0.05) this.playhead = 0
    this.hover = null
    this.playing = true
    this.scheduleAudio(this.playhead)
  }

  pause() {
    if (!this.playing) return
    this.playhead = Math.min(this.time(), duration(this.store.project))
    this.playing = false
    this.stopAudio()
    this.dirty = true
    this.onTime(this.playhead)
  }

  toggle() { this.playing ? this.pause() : void this.play() }

  /** Cambia la velocidad de la vista previa; si está sonando, sigue desde donde va. */
  setRate(r: number) {
    const t = this.time()
    this.rate = r
    if (this.playing) this.scheduleAudio(t)
  }

  private stopAudio() {
    for (const n of this.nodes) { try { n.stop() } catch { /* ya parado */ } n.disconnect() }
    this.nodes = []
  }

  private scheduleAudio(from: number) {
    this.stopAudio()
    const R = this.rate     // a velocidad R todo pasa R veces más rápido: los inicios se acercan y el audio se lee R veces más rápido
    this.t0 = from
    this.ctxStart = this.actx.currentTime + 0.05
    const placed = layout(this.store.project)
    const ts = (k: string) => this.store.project.tracks?.[k] ?? {}
    placed.forEach(({ clip, start, end }, i) => {
      if (end <= from || ts('main').muted) return
      const a = this.assets.get(clip.assetId)
      if (!a?.audio) return
      const inClip = Math.max(from - start, 0)            // segundos de línea de tiempo ya consumidos
      const st = clip.speed === 1 ? null : this.stretched.get(this.skey(clip.assetId, clip.speed))
      // Con audio estirado: se lee a velocidad 1 (tono intacto). Mientras se procesa: respaldo con playbackRate.
      const bufScale = st ? 1 / clip.speed : 1
      const buffer = st ?? a.audio
      const rate = st ? 1 : clip.speed
      const offset = (clip.srcIn + inClip * clip.speed) * bufScale
      const bufLen = (clip.srcOut - clip.srcIn) * bufScale - inClip * clip.speed * bufScale
      if (bufLen <= 0) return
      const realDur = bufLen / (rate * R)
      const when = this.ctxStart + Math.max(start - from, 0) / R
      const src = this.actx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = rate * R
      const g = this.actx.createGain()
      // Fundido mínimo solo donde el audio NO es continuo con el clip vecino (evita chasquidos).
      const prev = placed[i - 1]?.clip, next = placed[i + 1]?.clip
      const contigPrev = prev && prev.assetId === clip.assetId && Math.abs(prev.srcOut - clip.srcIn) < 1e-3 && prev.speed === clip.speed
      const contigNext = next && next.assetId === clip.assetId && Math.abs(next.srcIn - clip.srcOut) < 1e-3 && next.speed === clip.speed
      const F = 0.006
      if (realDur > 4 * F) {
        g.gain.setValueAtTime(contigPrev || inClip > 0 ? clip.volume : 0, when)
        if (!contigPrev && inClip === 0) g.gain.linearRampToValueAtTime(clip.volume, when + F)
        g.gain.setValueAtTime(clip.volume, when + realDur - F)
        if (!contigNext) g.gain.linearRampToValueAtTime(0, when + realDur)
      } else g.gain.value = clip.volume
      src.connect(g).connect(this.actx.destination)
      src.start(when, offset, bufLen)
      this.nodes.push(src)
    })
    // clips superpuestos (video con su audio, o pistas de audio): cada uno suena en su lugar del tiempo
    for (const o of this.store.project.overlays ?? []) {
      if (overlayEnd(o) <= from) continue
      const buf = o.kind === 'video' ? this.assets.get(o.assetId)?.audio : this.music.get(o.assetId)
      if (!buf || o.volume <= 0 || ts((o.kind === 'video' ? 'v' : 'a') + o.track).muted) continue
      const inO = Math.max(from - o.start, 0)
      const len = (o.srcOut - o.srcIn) - inO * o.speed
      if (len <= 0) continue
      const src = this.actx.createBufferSource(); src.buffer = buf; src.playbackRate.value = o.speed * R
      const g = this.actx.createGain(); g.gain.value = o.volume
      src.connect(g).connect(this.actx.destination)
      src.start(this.ctxStart + Math.max(o.start - from, 0) / R, Math.min(o.srcIn + inO * o.speed, buf.duration - 0.01), len)
      this.nodes.push(src)
    }
    // música: suena desde el inicio de la línea de tiempo, con fundido al final
    const m = this.store.project.music, mb = m && this.music.get(m.assetId)
    if (m && mb && !ts('music').muted) {
      const total = duration(this.store.project), len = total - from
      if (len > 0) {
        const src = this.actx.createBufferSource(); src.buffer = mb; src.playbackRate.value = R
        const g = this.actx.createGain()
        g.gain.setValueAtTime(m.volume, this.ctxStart)
        const fadeAt = this.ctxStart + (len - m.fadeOut) / R
        if (m.fadeOut > 0 && fadeAt >= this.ctxStart) { g.gain.setValueAtTime(m.volume, fadeAt); g.gain.linearRampToValueAtTime(0, this.ctxStart + len / R) }
        src.connect(g).connect(this.actx.destination)
        src.start(this.ctxStart, Math.min(m.srcIn + from, mb.duration - 0.01), len)
        this.nodes.push(src)
      }
    }
  }

  /** Llamado en cada requestAnimationFrame. Devuelve true si hubo que repintar. */
  tick(): boolean {
    if (this.playing) {
      const t = this.time()
      if (t >= duration(this.store.project)) { this.pause(); this.seek(duration(this.store.project)); }
      else this.onTime(t)
      this.dirty = true
    }
    if (!this.dirty) return false
    this.dirty = false
    this.draw(this.time())
    return true
  }

  private draw(t: number) {
    const tracks = this.store.project.tracks ?? {}
    const loc = tracks.main?.hidden ? null : locate(this.store.project, t)
    const cl = this.store.project.clips
    this.fx = loc ? fxAt(loc.placed.clip, cl[cl.indexOf(loc.placed.clip) + 1], t - loc.placed.start, loc.placed.end - loc.placed.start) : { zoom: 1, shift: 0, shiftY: 0, glitch: 0, flash: 0 }
    if (loc) {
      const asset = this.assets.get(loc.placed.clip.assetId)
      if (asset) {
        const idx = asset.source.idxAt(loc.srcTime)
        const fk = `${this.fx.zoom.toFixed(3)}|${this.fx.shift.toFixed(3)}|${this.fx.shiftY.toFixed(3)}|${this.fx.glitch.toFixed(3)}`
        const key = `${asset.info.id}:${idx}`
        if (key !== this.layerKey || fk !== this.fxKey) {
          const f = asset.source.peek(idx)
          if (f) { this.blit(f); this.layerKey = key; this.fxKey = fk }
          else if (key !== this.layerKey) { this.wanted = { asset, idx, key }; void this.pump() }
        }
        if (this.playing) asset.source.prefetch(idx, 6)
      }
    } else {
      this.layerCtx.fillStyle = '#000'; this.layerCtx.fillRect(0, 0, W, H); this.layerKey = ''
    }
    const tf = loc?.placed.clip.transform
    if (tf) {      // mover / agrandar / girar el video: todo el cuadro de la pista principal gira y se escala alrededor de su centro (el export hace lo mismo)
      this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, W, H)
      this.ctx.save(); this.ctx.translate(tf.x * W, tf.y * H); this.ctx.rotate((tf.rotation * Math.PI) / 180); this.ctx.scale(tf.scale, tf.scale); this.ctx.translate(-W / 2, -H / 2)
      this.ctx.drawImage(this.layer, 0, 0); this.ctx.restore()
    } else this.ctx.drawImage(this.layer, 0, 0)
    this.drawOverlayVideos(t)
    if (Math.abs(this.fx.flash) > 0.005) { this.ctx.fillStyle = this.fx.flash > 0 ? `rgba(255,255,255,${this.fx.flash})` : `rgba(0,0,0,${-this.fx.flash})`; this.ctx.fillRect(0, 0, W, H) }   // destello blanco o fundido a negro
    const sel = this.store.selection
    const tr = this.store.project.tracks
    const proj = tr?.subtitle?.hidden || tr?.graphic?.hidden ? { ...this.store.project, layers: this.store.project.layers.filter(l => !tr?.[l.type]?.hidden) } : this.store.project
    drawOverlays(this.ctx, proj, t, sel?.type === 'layer' ? sel.id : null)
    const vg = this.videoGeom(); if (vg) dibujarAsas(this.ctx, vg.geom, 'video')
    this.fps.n++
    const now = performance.now()
    if (now - this.fps.last > 1000) { this.fps.shown = this.fps.n; this.fps.n = 0; this.fps.last = now }
  }

  /** Videos superpuestos: de la pista más baja a la más alta, con su posición, tamaño, opacidad y esquinas redondeadas. */
  private drawOverlayVideos(t: number) {
    const ovs = (this.store.project.overlays ?? []).filter(o => o.kind === 'video' && !this.store.project.tracks?.['v' + o.track]?.hidden && t >= o.start && t < overlayEnd(o)).sort((a, b) => a.track - b.track)
    for (const o of ovs) {
      const asset = this.assets.get(o.assetId); if (!asset) continue
      const idx = asset.source.idxAt(o.srcIn + (t - o.start) * o.speed)
      if (this.playing) asset.source.prefetch(idx, 6)
      const f = asset.source.peek(idx)
      if (!f) { void asset.source.getFrame(idx).then(() => { this.dirty = true }).catch(() => {}); continue }
      const fw = f.displayWidth || f.codedWidth, fh = f.displayHeight || f.codedHeight
      const screen = o.blend === 'screen'      // luces: cubren todo el cuadro y suman su luz al video de abajo
      const k = (screen ? Math.max(W / fw, H / fh) : Math.min(W / fw, H / fh)) * o.transform.scale, w = fw * k, h = fh * k
      this.ovDims.set(o.id, { fw, fh })
      const x = o.transform.x * W - w / 2, y = o.transform.y * H - h / 2
      this.ctx.save()
      if (o.transform.rotation && !screen) { this.ctx.translate(o.transform.x * W, o.transform.y * H); this.ctx.rotate((o.transform.rotation * Math.PI) / 180); this.ctx.translate(-o.transform.x * W, -o.transform.y * H) }
      this.ctx.globalAlpha = o.transform.opacity
      if (screen) this.ctx.globalCompositeOperation = 'screen'
      else { this.ctx.beginPath(); this.ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.06); this.ctx.clip() }
      try { this.ctx.drawImage(f, x, y, w, h) } catch { /* frame cerrado por el LRU */ }
      this.ctx.restore()
    }
  }

  /** Dibuja el frame ajustado al lienzo (sin deformar): videos verticales quedan con barras. */
  private blit(f: VideoFrame) {
    const fw = f.displayWidth || f.codedWidth, fh = f.displayHeight || f.codedHeight
    this.mainDims = { fw, fh }
    const k = Math.min(W / fw, H / fh), z = this.fx.zoom, w = fw * k * z, h = fh * k * z
    this.layerCtx.fillStyle = '#000'; this.layerCtx.fillRect(0, 0, W, H)
    const dx = this.fx.shift * (fw * k * (z - 1)) / 2   // el efecto "slide" desplaza la ventana de recorte
    const dy = this.fx.shiftY * (fh * k * (z - 1)) / 2
    if (this.fx.glitch > 0.01) {                       // glitch: tres copias con un solo canal de color (R, G, B) desplazadas en horizontal y sumadas
      const d = this.fx.glitch * 0.02 * W, tmp = (this.glitchTmp ??= new OffscreenCanvas(W, H)), t = tmp.getContext('2d')!
      for (const [off, col] of [[-d, '#ff0000'], [0, '#00ff00'], [d, '#0000ff']] as const) {
        t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H)
        try { t.drawImage(f, (W - w) / 2 - dx + off * 0.0, (H - h) / 2 - dy, w, h) } catch { /* frame cerrado */ }
        t.globalCompositeOperation = 'multiply'; t.fillStyle = col; t.fillRect(0, 0, W, H)
        this.layerCtx.globalCompositeOperation = 'lighter'; this.layerCtx.drawImage(tmp, off, 0); this.layerCtx.globalCompositeOperation = 'source-over'
      }
      return
    }
    try { this.layerCtx.drawImage(f, (W - w) / 2 - dx, (H - h) / 2 - dy, w, h) } catch { /* frame cerrado por el LRU */ }
  }

  private async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.wanted && this.wanted.key !== this.layerKey) {
        const w = this.wanted
        const f = await w.asset.source.getFrame(w.idx)
        this.blit(f)
        this.layerKey = w.key; this.fxKey = `${this.fx.zoom.toFixed(3)}|${this.fx.shift.toFixed(3)}|${this.fx.shiftY.toFixed(3)}|${this.fx.glitch.toFixed(3)}`
        this.dirty = true
      }
    } finally { this.pumping = false }
  }

  /**
   * Caja del video seleccionado (clip de la pista principal o video superpuesto) en el lienzo, con su transformación:
   * con ella se dibujan y se prueban las asas (esquinas = tamaño sin deformar, asa de arriba = giro, dentro = mover).
   */
  videoGeom(): { kind: 'clip' | 'overlay'; id: string; geom: Geom; x: number; y: number; scale: number; rotation: number; cover: number } | null {
    const sel = this.store.selection, p = this.store.project, t = this.time()
    if (sel?.type === 'clip') {
      const loc = locate(p, t); if (!loc || loc.placed.clip.id !== sel.id || p.tracks?.main?.hidden || !this.mainDims) return null
      const { fw, fh } = this.mainDims, k = Math.min(W / fw, H / fh), cw = fw * k, ch = fh * k, tf = { ...CLIP_TRANSFORM_DEFAULT, ...loc.placed.clip.transform }
      const geom: Geom = { b: { x: W / 2 - cw / 2, y: H / 2 - ch / 2, w: cw, h: ch }, D: { x: W / 2, y: H / 2 }, F: { x: tf.x * W, y: tf.y * H }, rot: (tf.rotation * Math.PI) / 180, sx: tf.scale, sy: tf.scale, auto: false }
      return { kind: 'clip', id: sel.id, geom, x: tf.x, y: tf.y, scale: tf.scale, rotation: tf.rotation, cover: Math.max(W / cw, H / ch) }
    }
    if (sel?.type === 'overlay') {
      const o = p.overlays?.find(q => q.id === sel.id), d = o && this.ovDims.get(o.id)
      if (!o || !d || o.kind !== 'video' || o.blend === 'screen' || p.tracks?.['v' + o.track]?.hidden || t < o.start || t >= overlayEnd(o)) return null
      const k = Math.min(W / d.fw, H / d.fh), w = d.fw * k, h = d.fh * k, tr = o.transform, c = { x: tr.x * W, y: tr.y * H }
      const geom: Geom = { b: { x: c.x - (w * tr.scale) / 2, y: c.y - (h * tr.scale) / 2, w: w * tr.scale, h: h * tr.scale }, D: c, F: c, rot: ((tr.rotation || 0) * Math.PI) / 180, sx: 1, sy: 1, auto: false }
      return { kind: 'overlay', id: o.id, geom, x: tr.x, y: tr.y, scale: tr.scale, rotation: tr.rotation || 0, cover: Math.max(W / w, H / h) }
    }
    return null
  }

  /** Captura de la vista previa actual (para que Claude "mire" un frame). */
  snapshotDataUrl() { return this.canvas.toDataURL('image/jpeg', 0.7) }
}
