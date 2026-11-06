import { PEAK_RATE, THUMB_H, THUMB_W } from './media'
import { FX_INFO, TRANSITIONS } from './fxinfo'
import type { Player } from './player'
import { MIN_DUR, clipDur, compactTracks, duration, exec, freeTrack, isTextLayer, layout, overlayDur, overlayEnd, trackCount, type OverlayClip, type Placed, type Store, type TextLayer } from '@gojaguar/core'

const LEFT = 78, RULER_H = 26
interface Row { y: number; h: number; label: string }
/** Filas fijas; sus posiciones se recalculan en relayout() según cuántas pistas superpuestas haya. */
const ROWS: Record<'subtitle' | 'graphic' | 'video' | 'music', Row> = {
  subtitle: { y: 30, h: 26, label: 'Subtítulos' },
  graphic: { y: 60, h: 26, label: 'Gráficos' },
  video: { y: 92, h: 88, label: 'Video' },
  music: { y: 186, h: 40, label: 'Música' },
}
const EDGE = 7
const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`

type Drag =
  | { k: 'seek' }
  | { k: 'trim'; edge: 'in' | 'out'; id: string; x0: number; in0: number; out0: number; start0: number }
  | { k: 'clip'; id: string; x0: number; moved: boolean; target: number }
  | { k: 'ovc'; id: string; mode: 'move' | 'l' | 'r'; x0: number; start0: number; in0: number; out0: number }
  | { k: 'ov'; id: string; mode: 'move' | 'l' | 'r'; x0: number; s0: number; e0: number; moved: boolean }

export class Timeline {
  ctx: CanvasRenderingContext2D
  pps = 14
  scrollX = 0
  dirty = true
  private w = 0
  private drag: Drag | null = null
  private hoverX: number | null = null
  private vLanes: Row[] = []      // pistas de video superpuestas (índice 0 = pista 1)
  private aLanes: Row[] = []      // pistas de audio extra
  private height = 234
  /** Tipo de pista con una pista vacía extra visible (solo mientras se arrastra: así se puede soltar en una pista nueva). */
  private extra: 'video' | 'audio' | null = null
  private mouse = { x: 0, y: 0 }
  /** Corte al que el cabezal quedó "pegado" (imán), para dibujar la guía. */
  private snapAt: number | null = null
  private hoverCut: string | null = null      // clip cuyo corte de entrada está bajo el mouse (sin transición)
  /** Lo llama al tocar el corte entre dos clips (el editor abre el menú de transición). */
  onCutClick: (clipId: string, clientX: number, clientY: number) => void = () => {}

  constructor(private canvas: HTMLCanvasElement, private store: Store, private player: Player) {
    this.ctx = canvas.getContext('2d')!
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!)
    store.onChange(() => { this.dirty = true })
    canvas.addEventListener('mousemove', e => this.onMove(e))
    canvas.addEventListener('mousedown', e => this.onDown(e))
    window.addEventListener('mouseup', () => this.onUp())
    window.addEventListener('mousemove', e => { if (this.drag) this.onMove(e) })
    canvas.addEventListener('mouseleave', () => { if (!this.drag) { this.hoverX = null; this.snapAt = null; this.hoverCut = null; player.hover = null; player.dirty = true; this.dirty = true } })
    canvas.addEventListener('dblclick', e => this.onDbl(e))
    canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false })
    canvas.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('text/gojaguar-asset')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } })
    canvas.addEventListener('drop', e => this.onDropAsset(e))
    this.resize()
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    this.w = this.canvas.parentElement!.clientWidth
    this.canvas.style.width = this.w + 'px'
    this.canvas.style.height = this.height + 'px'
    this.canvas.width = Math.floor(this.w * dpr)
    this.canvas.height = Math.floor(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.dirty = true
  }

  /** Imán: si el tiempo cae a pocos píxeles de un corte entre clips (o del inicio/fin), se ajusta a él. */
  private magnet(t: number): number {
    const reach = 9 / this.pps
    let best = t, bd = reach
    for (const c of [0, ...layout(this.store.project).map(q => q.end)]) { const d = Math.abs(c - t); if (d <= bd) { bd = d; best = c } }
    this.snapAt = best !== t ? best : null
    return best
  }

  private t2x = (t: number) => LEFT + t * this.pps - this.scrollX
  private x2t = (x: number) => Math.max(0, (x - LEFT + this.scrollX) / this.pps)
  private total() { return duration(this.store.project) }

  fit() {
    this.pps = Math.max(2, (this.w - LEFT - 40) / Math.max(this.total(), 1))
    this.scrollX = 0; this.dirty = true
  }
  zoom(f: number, anchorX = this.w / 2) {
    const t = this.x2t(anchorX)
    this.pps = Math.min(Math.max(this.pps * f, 2), 600)
    this.scrollX = Math.max(0, t * this.pps - (anchorX - LEFT))
    this.dirty = true
  }

  // --- hit testing ----------------------------------------------------------
  /** Lo usa el panel Material: mientras se arrastra un archivo, aparece una pista de su tipo donde soltarlo. */
  showDropLane(kind: 'video' | 'audio' | null) { this.extra = kind; this.dirty = true }

  /** Coloca las filas: textos, pistas de video superpuestas (la más alta arriba), video principal, música y pistas de audio. Solo se ven las pistas en uso. */
  private relayout() {
    const p = this.store.project
    const nv = trackCount(p, 'video') + (this.extra === 'video' ? 1 : 0), na = trackCount(p, 'audio') + (this.extra === 'audio' ? 1 : 0)
    let y = 30
    ROWS.subtitle.y = y; y += 30
    ROWS.graphic.y = y; y += 32
    this.vLanes = []
    for (let k = nv; k >= 1; k--) { this.vLanes[k - 1] = { y, h: 46, label: `Video ${k + 1}` }; y += 50 }
    ROWS.video.y = y; y += ROWS.video.h + 6
    ROWS.music.y = y; y += ROWS.music.h + 6
    this.aLanes = []
    for (let k = 1; k <= na; k++) { this.aLanes[k - 1] = { y, h: 36, label: `Audio ${k}` }; y += 40 }
    const h = y + 4
    if (h !== this.height) { this.height = h; this.resize() }
  }

  private rowAt(y: number): keyof typeof ROWS | 'ruler' | 'vlane' | 'alane' | null {
    if (y < RULER_H) return 'ruler'
    for (const k of Object.keys(ROWS) as (keyof typeof ROWS)[]) if (y >= ROWS[k].y && y < ROWS[k].y + ROWS[k].h) return k
    if (this.vLanes.some(r => y >= r.y && y < r.y + r.h)) return 'vlane'
    if (this.aLanes.some(r => y >= r.y && y < r.y + r.h)) return 'alane'
    return null
  }
  /** Pista (1, 2…) que corresponde a la altura `y` para un tipo. Por encima/debajo de las pistas existentes devuelve la extrema. */
  private laneAt(y: number, kind: 'video' | 'audio'): number | null {
    const lanes = kind === 'video' ? this.vLanes : this.aLanes
    if (!lanes.length) return null
    for (let i = 0; i < lanes.length; i++) if (y >= lanes[i].y - 2 && y < lanes[i].y + lanes[i].h + 2) return i + 1
    if (kind === 'video') return y < lanes[lanes.length - 1].y ? lanes.length : 1
    return y > lanes[lanes.length - 1].y ? lanes.length : 1
  }
  /** Clip superpuesto bajo el mouse en su pista. */
  private hitOverlayClip(x: number, y: number, kind: 'video' | 'audio'): { o: OverlayClip; zone: 'l' | 'r' | 'move' } | null {
    const lanes = kind === 'video' ? this.vLanes : this.aLanes
    for (const o of [...(this.store.project.overlays ?? [])].reverse()) {
      const R = o.kind === kind ? lanes[o.track - 1] : null
      if (!R || y < R.y || y >= R.y + R.h) continue
      const x0 = this.t2x(o.start), x1 = this.t2x(overlayEnd(o))
      if (x >= x0 && x <= x1) return { o, zone: x - x0 < EDGE ? 'l' : x1 - x < EDGE ? 'r' : 'move' }
    }
    return null
  }
  private hitClip(x: number): { p: Placed; zone: 'in' | 'out' | 'body' } | null {
    for (const p of layout(this.store.project)) {
      const x0 = this.t2x(p.start), x1 = this.t2x(p.end)
      if (x >= x0 && x <= x1) return { p, zone: x - x0 < EDGE ? 'in' : x1 - x < EDGE ? 'out' : 'body' }
    }
    return null
  }
  private hitOverlay(x: number, kind: 'subtitle' | 'graphic'): { o: TextLayer; zone: 'l' | 'r' | 'move' } | null {
    const list = this.store.project.layers.filter(isTextLayer).filter(o => o.type === kind)
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], x0 = this.t2x(o.start), x1 = this.t2x(o.end)
      if (x >= x0 && x <= x1) return { o, zone: x - x0 < EDGE ? 'l' : x1 - x < EDGE ? 'r' : 'move' }
    }
    return null
  }

  private snap(t: number, ignoreId?: string) {
    const pts = [0, this.player.playhead]
    for (const p of layout(this.store.project)) pts.push(p.start, p.end)
    for (const o of this.store.project.layers) if (o.id !== ignoreId) pts.push(o.start, o.end)
    for (const o of this.store.project.overlays ?? []) if (o.id !== ignoreId) pts.push(o.start, overlayEnd(o))
    const tol = 8 / this.pps
    let best = t, bd = tol
    for (const q of pts) if (Math.abs(q - t) < bd) { bd = Math.abs(q - t); best = q }
    return best
  }

  private pos(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // --- eventos ----------------------------------------------------------------
  private onDown(e: MouseEvent) {
    const { x, y } = this.pos(e)
    if (x < LEFT) return
    const row = this.rowAt(y)
    const t = this.magnet(Math.min(this.x2t(x), this.total()))
    this.player.hover = null

    if (row === 'ruler') { this.drag = { k: 'seek' }; this.player.seek(t); return }

    if (row === 'video') {
      const tr = this.hitTransition(x, y) ?? this.hitCut(x, y)
      if (tr) {
        this.player.seek(tr.start + 0.01)
        const r = this.canvas.getBoundingClientRect()
        this.onCutClick(tr.clip.id, r.left + this.t2x(tr.start), r.top + ROWS.video.y)
        return
      }
    }
    if (row === 'video') {
      const h = this.hitClip(x)
      if (!h) { this.store.select(null); this.player.seek(t); this.drag = { k: 'seek' }; return }
      this.store.select({ type: 'clip', id: h.p.clip.id })
      if (h.zone === 'body') {
        this.drag = { k: 'clip', id: h.p.clip.id, x0: x, moved: false, target: this.store.project.clips.indexOf(h.p.clip) }
        this.player.seek(t)
      } else {
        this.store.beginTx()
        this.drag = { k: 'trim', edge: h.zone, id: h.p.clip.id, x0: x, in0: h.p.clip.srcIn, out0: h.p.clip.srcOut, start0: h.p.start }
      }
      return
    }

    if (row === 'music') { this.store.select(null); this.player.seek(t); this.drag = { k: 'seek' }; return }

    if (row === 'vlane' || row === 'alane') {
      const h = this.hitOverlayClip(x, y, row === 'vlane' ? 'video' : 'audio')
      if (!h) { this.store.select(null); this.player.seek(t); this.drag = { k: 'seek' }; return }
      this.store.select({ type: 'overlay', id: h.o.id })
      this.store.beginTx()
      this.drag = { k: 'ovc', id: h.o.id, mode: h.zone, x0: x, start0: h.o.start, in0: h.o.srcIn, out0: h.o.srcOut }
      return
    }

    if (row === 'subtitle' || row === 'graphic') {
      const h = this.hitOverlay(x, row)
      if (!h) { this.store.select(null); this.player.seek(t); this.drag = { k: 'seek' }; return }
      this.store.select({ type: 'layer', id: h.o.id })
      this.store.beginTx()
      this.drag = { k: 'ov', id: h.o.id, mode: h.zone, x0: x, s0: h.o.start, e0: h.o.end, moved: false }
      return
    }
    this.store.select(null)
  }

  private onMove(e: MouseEvent) {
    const { x, y } = this.pos(e)
    this.mouse = { x, y }
    const d = this.drag
    const p = this.store.project

    if (!d) {
      // Scrub: el cursor "navega" el video sin tocar el playhead.
      if (x >= LEFT && !this.player.playing) {
        const t = this.magnet(this.x2t(x))
        this.hoverX = this.snapAt !== null ? this.t2x(this.snapAt) : x
        this.player.hover = Math.min(t, Math.max(this.total() - 1e-3, 0))
        this.player.dirty = true
      } else { this.hoverX = null; this.snapAt = null; this.player.hover = null; this.player.dirty = true }
      const cut = x >= LEFT ? this.hitCut(x, y) : null
      this.hoverCut = cut?.clip.id ?? null
      this.canvas.style.cursor = cut || this.hitTransition(x, y) ? 'pointer' : this.cursorAt(x, y)
      this.dirty = true
      return
    }

    this.dirty = true
    if (d.k === 'seek') { this.player.seek(this.magnet(Math.min(this.x2t(x), this.total()))); return }

    if (d.k === 'ovc') {
      const dt = (x - d.x0) / this.pps, y = this.mouse.y
      const o0 = this.store.project.overlays?.find(q => q.id === d.id)
      const dur = this.store.asset(o0?.assetId ?? '')?.duration ?? Infinity
      if (o0 && d.mode === 'move') {   // una pista nueva aparece solo al arrastrar más allá de la última de su tipo
        const lanes = o0.kind === 'video' ? this.vLanes : this.aLanes, ref = lanes[trackCount(this.store.project, o0.kind) - 1]
        this.extra = ref && (o0.kind === 'video' ? y < ref.y : y > ref.y + ref.h) ? o0.kind : null
      }
      this.store.live(pr => {
        const o = pr.overlays!.find(q => q.id === d.id)!
        if (d.mode === 'move') {
          const len = overlayDur(o)
          let st = Math.max(0, d.start0 + dt)
          const sn = this.snap(st, d.id), en = this.snap(st + len, d.id)
          st = sn !== st ? sn : en !== st + len ? en - len : st
          o.start = Math.max(0, st)
          o.track = freeTrack(pr, o.kind, o.start, o.start + len, this.laneAt(y, o.kind) ?? o.track, o.id)   // si pisa a otro, se abre otra pista
        } else if (d.mode === 'l') {
          let nin = Math.min(Math.max(d.in0 + dt * o.speed, 0), d.out0 - MIN_DUR * o.speed)
          let delta = (nin - d.in0) / o.speed
          if (d.start0 + delta < 0) { delta = -d.start0; nin = d.in0 + delta * o.speed }
          o.srcIn = nin; o.start = d.start0 + delta
        } else {
          o.srcOut = Math.max(Math.min(d.out0 + dt * o.speed, dur), d.in0 + MIN_DUR * o.speed)
        }
        if (d.mode !== 'move') o.track = freeTrack(pr, o.kind, o.start, o.start + overlayDur(o), o.track, o.id)
      })
      return
    }

    if (d.k === 'trim') {
      const dt = (x - d.x0) / this.pps
      this.store.live(pr => {
        const c = pr.clips.find(q => q.id === d.id)!
        const total = this.store.asset(c.assetId)?.duration ?? Infinity
        const minSrc = MIN_DUR * c.speed
        if (d.edge === 'in') c.srcIn = Math.min(Math.max(d.in0 + dt * c.speed, 0), c.srcOut - minSrc)
        else c.srcOut = Math.max(Math.min(d.out0 + dt * c.speed, total), c.srcIn + minSrc)
      })
      // Ver en vivo el frame exacto donde se está cortando.
      const c = p.clips.find(q => q.id === d.id)!
      this.player.override = d.edge === 'in' ? d.start0 + 1e-3 : d.start0 + clipDur(c) - 1 / 30
      this.player.dirty = true
      return
    }

    if (d.k === 'clip') {
      if (Math.abs(x - d.x0) > 4) d.moved = true
      if (d.moved) {
        const others = layout(p).filter(q => q.clip.id !== d.id)
        const t = this.x2t(x)
        let target = 0
        for (const q of others) if (t > (q.start + q.end) / 2) target++
        d.target = target
      }
      return
    }

    if (d.k === 'ov') {
      const dt = (x - d.x0) / this.pps
      if (Math.abs(x - d.x0) > 2) d.moved = true
      this.store.live(pr => {
        const o = pr.layers.find(q => q.id === d.id)!
        if (d.mode === 'move') {
          const len = d.e0 - d.s0
          let s = Math.max(0, d.s0 + dt)
          const sn = this.snap(s, d.id), en = this.snap(s + len, d.id)
          s = Math.abs(sn - s) <= Math.abs(en - (s + len)) ? sn : en - len
          o.start = Math.max(0, s); o.end = o.start + len
        } else if (d.mode === 'l') o.start = Math.min(this.snap(Math.max(0, d.s0 + dt), d.id), o.end - 0.1)
        else o.end = Math.max(this.snap(d.e0 + dt, d.id), o.start + 0.1)
      })
    }
  }

  private onUp() {
    const d = this.drag
    if (!d) return
    this.drag = null
    this.snapAt = null
    this.player.override = null
    if (d.k === 'ovc') { this.extra = null; this.store.live(pr => compactTracks(pr)) }   // si una pista quedó vacía, desaparece
    if (d.k === 'trim' || d.k === 'ov' || d.k === 'ovc') this.store.endTx()
    if (d.k === 'clip' && d.moved) {
      if (d.target !== this.store.project.clips.findIndex(c => c.id === d.id)) exec(this.store, { op: 'move_clip', id: d.id, to_index: d.target })
    }
    this.player.dirty = true; this.dirty = true
  }

  /** Soltar un archivo del panel Material: se coloca donde se suelta; si cae en una pista de su tipo, ahí (o en la siguiente libre). */
  private onDropAsset(e: DragEvent) {
    const id = e.dataTransfer?.getData('text/gojaguar-asset'); if (!id) return
    e.preventDefault()
    const { x, y } = this.pos(e); const a = this.store.asset(id)
    if (x < LEFT || !a) return
    const kind: 'video' | 'audio' = a.kind === 'audio' ? 'audio' : 'video', row = this.rowAt(y)
    const track = (row === 'vlane' && kind === 'video') || (row === 'alane' && kind === 'audio') ? this.laneAt(y, kind) ?? undefined : undefined
    const t = this.magnet(this.x2t(x)); this.snapAt = null
    this.extra = null
    exec(this.store, { op: 'add_overlay', asset: id, start: t, track })
    const o = this.store.project.overlays?.at(-1); if (o) this.store.select({ type: 'overlay', id: o.id })
  }

  private onDbl(e: MouseEvent) {
    const { x, y } = this.pos(e)
    const row = this.rowAt(y)
    if ((row === 'subtitle' || row === 'graphic') && x >= LEFT && !this.hitOverlay(x, row)) {
      const t = this.x2t(x)
      exec(this.store, { op: 'add_text', type: row, start: t, end: t + 2.5, text: row === 'subtitle' ? 'Nuevo subtítulo' : 'Nuevo gráfico' })
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) this.zoom(Math.exp(-e.deltaY * 0.01), this.pos(e).x)
    else {
      const max = Math.max(0, this.total() * this.pps + 160 - (this.w - LEFT))
      this.scrollX = Math.min(Math.max(0, this.scrollX + (e.deltaX || e.deltaY)), max)
    }
    this.dirty = true
  }

  private cursorAt(x: number, y: number) {
    if (x < LEFT) return 'default'
    const row = this.rowAt(y)
    if (row === 'video') {
      const h = this.hitClip(x)
      return h ? (h.zone === 'body' ? 'grab' : 'ew-resize') : 'default'
    }
    if (row === 'subtitle' || row === 'graphic') {
      const h = this.hitOverlay(x, row)
      return h ? (h.zone === 'move' ? 'grab' : 'ew-resize') : 'cell'
    }
    if (row === 'vlane' || row === 'alane') {
      const h = this.hitOverlayClip(x, y, row === 'vlane' ? 'video' : 'audio')
      return h ? (h.zone === 'move' ? 'grab' : 'ew-resize') : 'default'
    }
    return 'default'
  }

  // --- dibujo -----------------------------------------------------------------
  draw() {
    this.dirty = false
    this.relayout()
    const c = this.ctx, w = this.w
    const p = this.store.project
    c.clearRect(0, 0, w, this.height)
    c.fillStyle = '#191917'; c.fillRect(0, 0, w, this.height)

    // seguir el playhead durante la reproducción
    if (this.player.playing) {
      const px = this.t2x(this.player.time())
      if (px > w - 60) this.scrollX += px - (w - 60)
    }

    for (const k of Object.keys(ROWS) as (keyof typeof ROWS)[]) {
      c.fillStyle = '#232321'; c.fillRect(LEFT, ROWS[k].y, w - LEFT, ROWS[k].h)
    }
    for (const r of [...this.vLanes, ...this.aLanes]) { c.fillStyle = '#212120'; c.fillRect(LEFT, r.y, w - LEFT, r.h) }
    this.drawRuler()

    const placed = layout(p)
    const dragging = this.drag?.k === 'clip' && this.drag.moved ? this.drag : null
    for (const pl of placed) this.drawClip(pl, dragging?.id === pl.clip.id)

    for (const o of p.layers) if (isTextLayer(o)) this.drawOverlay(o)
    this.drawTransitions(placed)
    this.drawMusic()
    this.drawOverlayClips()

    // indicador de destino al reordenar
    if (dragging) {
      const others = placed.filter(q => q.clip.id !== dragging.id)
      const tx = dragging.target <= 0 ? 0 : others[Math.min(dragging.target, others.length) - 1].end
      const x = this.t2x(tx)
      c.fillStyle = '#ffd24d'; c.fillRect(x - 1.5, ROWS.video.y - 2, 3, ROWS.video.h + 4)
      const g = placed.find(q => q.clip.id === dragging.id)!
      c.globalAlpha = 0.65; c.fillStyle = '#e8b152'
      const gw = (g.end - g.start) * this.pps
      c.fillRect(this.mouse.x - gw / 2, ROWS.video.y + 4, gw, ROWS.video.h - 8)
      c.globalAlpha = 1
    }

    // línea de hover (scrub)
    if (this.hoverX !== null && !this.drag && !this.player.playing) {
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1
      c.beginPath(); c.moveTo(this.hoverX + .5, RULER_H - 6); c.lineTo(this.hoverX + .5, this.height); c.stroke()
    }

    // playhead
    const ph = this.t2x(this.player.playing ? this.player.time() : this.player.playhead)
    if (ph >= LEFT - 1) {
      c.strokeStyle = '#ff4d4d'; c.lineWidth = 2
      c.beginPath(); c.moveTo(ph, 0); c.lineTo(ph, this.height); c.stroke()
      c.fillStyle = '#ff4d4d'
      c.beginPath(); c.moveTo(ph - 6, 0); c.lineTo(ph + 6, 0); c.lineTo(ph, 10); c.closePath(); c.fill()
    }

    // gutter de etiquetas (tapa lo que se desplaza debajo)
    c.fillStyle = '#191917'; c.fillRect(0, 0, LEFT, this.height)
    c.fillStyle = '#a39e92'; c.font = '11px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
    for (const k of Object.keys(ROWS) as (keyof typeof ROWS)[]) c.fillText(ROWS[k].label, 10, ROWS[k].y + ROWS[k].h / 2)
    for (const r of [...this.vLanes, ...this.aLanes]) c.fillText(r.label, 10, r.y + r.h / 2)
  }

  private drawRuler() {
    const c = this.ctx
    c.fillStyle = '#151513'; c.fillRect(LEFT, 0, this.w - LEFT, RULER_H)
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120]
    const major = steps.find(s => s * this.pps >= 70) ?? 120
    const minor = major / 5
    const t0 = this.x2t(LEFT), t1 = this.x2t(this.w)
    c.font = '10px ui-monospace, Menlo, monospace'; c.textBaseline = 'top'
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
      const x = Math.round(this.t2x(t)) + .5
      if (x < LEFT) continue
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6
      c.strokeStyle = isMajor ? '#7d786d' : '#46463f'
      c.beginPath(); c.moveTo(x, RULER_H - (isMajor ? 12 : 6)); c.lineTo(x, RULER_H); c.stroke()
      if (isMajor) {
        c.fillStyle = '#a39e92'
        const m = Math.floor(t / 60), s = t % 60
        c.fillText(`${m}:${s.toFixed(major < 1 ? 1 : 0).padStart(major < 1 ? 4 : 2, '0')}`, x + 3, 3)
      }
    }
  }

  private drawClip(pl: Placed, ghost: boolean) {
    const c = this.ctx
    const x0 = this.t2x(pl.start) + 0.5, x1 = this.t2x(pl.end) - 0.5     // casi pegados, como en CapCut
    if (x1 < LEFT || x0 > this.w) return
    const a = this.player.assets.get(pl.clip.assetId)
    const sel = this.store.selection?.type === 'clip' && this.store.selection.id === pl.clip.id
    const V = ROWS.video, w = Math.max(x1 - x0, 2), HEAD = 18, WAVE = 20, TH = V.h - HEAD - WAVE
    const dur = (pl.end - pl.start)

    c.save()
    c.globalAlpha = ghost ? 0.35 : 1
    c.beginPath(); c.roundRect(x0, V.y, w, V.h, 3); c.clip()
    c.fillStyle = '#0d4f53'; c.fillRect(x0, V.y, w, V.h)
    // miniaturas (recortadas al centro)
    if (a) {
      const tw = THUMB_W * (TH / THUMB_H)
      for (let tx = x0; tx < x1; tx += tw) {
        if (tx + tw < LEFT || tx > this.w) continue
        const src = pl.clip.srcIn + ((tx + tw / 2 - x0) / this.pps) * pl.clip.speed
        const th = a.thumbs[Math.min(Math.floor(src), a.thumbs.length - 1)]
        if (th) c.drawImage(th, tx, V.y + HEAD, tw, TH)
      }
    }
    // cabecera: nombre y duración
    c.fillStyle = '#0f6a6f'; c.fillRect(x0, V.y, w, HEAD)
    c.fillStyle = '#fff'; c.font = '11px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
    const name = a?.info.name ?? pl.clip.id
    c.fillText(`${name}  ${tc(dur)}${pl.clip.speed !== 1 ? `  ×${pl.clip.speed}` : ''}`, Math.max(x0, LEFT) + 6, V.y + HEAD / 2)
    // onda del audio del clip, al pie
    c.fillStyle = '#0a3d40'; c.fillRect(x0, V.y + V.h - WAVE, w, WAVE)
    if (a && a.peaks.length) {
      c.fillStyle = '#35c2b5'
      const mid = V.y + V.h - WAVE / 2
      for (let x = Math.max(Math.floor(x0), LEFT); x < Math.min(x1, this.w); x++) {
        const t = pl.clip.srcIn + ((x - x0) / this.pps) * pl.clip.speed
        const i0 = Math.floor(t * PEAK_RATE)
        const i1 = Math.max(i0 + 1, Math.floor((t + (pl.clip.speed / this.pps)) * PEAK_RATE))
        let m = 0
        for (let i = i0; i < i1 && i < a.peaks.length; i++) if (a.peaks[i] > m) m = a.peaks[i]
        const h = Math.min(1, m * pl.clip.volume) * (WAVE - 4)
        c.fillRect(x, mid - h / 2, 1, Math.max(h, 1))
      }
    }
    // etiqueta de zoom (los zooms son "animaciones" del clip; las transiciones van como pastilla en el corte)
    const fx = pl.clip.fx
    if (fx && !TRANSITIONS.has(fx) && w > 60) {
      const label = FX_INFO[fx].name
      c.font = '10px Figtree, system-ui, sans-serif'
      const tw2 = Math.min(c.measureText(label).width + 20, w - 8)
      c.fillStyle = 'rgba(20,20,18,.78)'; c.beginPath(); c.roundRect(x0 + 4, V.y + HEAD + 4, tw2, 16, 5); c.fill()
      c.fillStyle = FX_INFO[fx].color; c.beginPath(); c.arc(x0 + 12, V.y + HEAD + 12, 3, 0, Math.PI * 2); c.fill()
      c.save(); c.beginPath(); c.roundRect(x0 + 4, V.y + HEAD + 4, tw2, 16, 5); c.clip()
      c.fillStyle = '#fff'; c.fillText(label, x0 + 18, V.y + HEAD + 12); c.restore()
    }
    c.restore()

    // selección: contorno blanco con asas, como en CapCut
    if (sel) {
      c.strokeStyle = '#fff'; c.lineWidth = 2
      c.beginPath(); c.roundRect(x0 + 1, V.y + 1, w - 2, V.h - 2, 3); c.stroke()
      c.fillStyle = '#fff'
      for (const xx of [x0 + 1, x1 - 7]) { c.beginPath(); c.roundRect(xx, V.y + V.h / 2 - 14, 6, 28, 3); c.fill() }
    }
  }

  /** Pastilla de transición en el corte (entre el clip anterior y este), como en CapCut. */
  private chipPos(pl: Placed) { return { cx: this.t2x(pl.start), cy: ROWS.video.y + ROWS.video.h / 2, r: 12 } }
  /** El corte está "ocupado" si uno de sus dos clips vecinos está seleccionado: ahí van las asas de recorte, no la transición. */
  private cutBusy(placed: Placed[], i: number) {
    const s = this.store.selection
    return s?.type === 'clip' && (s.id === placed[i].clip.id || s.id === placed[i - 1].clip.id)
  }
  /** Corte entre dos clips que aún NO tiene transición (zona de la pastilla "+"). */
  private hitCut(x: number, y: number): Placed | null {
    const placed = layout(this.store.project), V = ROWS.video
    if (y < V.y || y > V.y + V.h) return null
    for (let i = 1; i < placed.length; i++) {
      const fx = placed[i].clip.fx
      if ((fx && TRANSITIONS.has(fx)) || this.cutBusy(placed, i)) continue
      if (Math.abs(x - this.t2x(placed[i].start)) <= 10 && Math.abs(y - (V.y + V.h / 2)) <= 16) return placed[i]
    }
    return null
  }
  private hitTransition(x: number, y: number): Placed | null {
    const placed = layout(this.store.project)
    for (let i = 1; i < placed.length; i++) {
      const fx = placed[i].clip.fx; if (!fx || !TRANSITIONS.has(fx) || this.cutBusy(placed, i)) continue
      const { cx, cy, r } = this.chipPos(placed[i])
      if (Math.abs(x - cx) <= r && Math.abs(y - cy) <= 16) return placed[i]
    }
    return null
  }
  private drawTransitions(placed: Placed[]) {
    const c = this.ctx
    const hc = this.hoverCut && !this.drag ? placed.find(q => q.clip.id === this.hoverCut) : null
    if (hc) {
      const { cx, cy } = this.chipPos(hc)
      c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 4
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(cx - 10, cy - 14, 20, 28, 3); c.fill(); c.shadowBlur = 0
      c.strokeStyle = '#1d1d1b'; c.lineWidth = 2; c.lineCap = 'round'
      c.beginPath(); c.moveTo(cx - 5, cy); c.lineTo(cx + 5, cy); c.moveTo(cx, cy - 5); c.lineTo(cx, cy + 5); c.stroke()
      c.restore()
    }
    if (this.snapAt !== null) {     // guía del imán
      const sx = this.t2x(this.snapAt)
      c.save(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5; c.setLineDash([4, 3])
      c.beginPath(); c.moveTo(sx, RULER_H); c.lineTo(sx, this.height); c.stroke(); c.restore()
    }
    for (let i = 1; i < placed.length; i++) {
      const fx = placed[i].clip.fx; if (!fx || !TRANSITIONS.has(fx)) continue
      const { cx, cy, r } = this.chipPos(placed[i])
      if (cx < LEFT + r || cx > this.w + r) continue
      const info = FX_INFO[fx], sel = this.store.selection?.type === 'clip' && this.store.selection.id === placed[i].clip.id
      c.save()
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 4
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(cx - 10, cy - 14, 20, 28, 3); c.fill()
      c.shadowBlur = 0
      if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.roundRect(cx - 13, cy - 17, 26, 34, 5); c.stroke() }
      c.fillStyle = info.color; c.beginPath(); c.roundRect(cx - 10, cy + 10, 20, 4, 2); c.fill()
      c.fillStyle = '#1d1d1b'; c.strokeStyle = '#1d1d1b'; c.lineWidth = 1.8; c.lineCap = 'round'; c.lineJoin = 'round'
      if (fx === 'slide') {            // flechas ⇄
        const d = (placed[i].clip.fxDir ?? 1) > 0 ? 1 : -1
        c.beginPath(); c.moveTo(cx - 6 * d, cy - 2.5); c.lineTo(cx + 6 * d, cy - 2.5); c.moveTo(cx + 3 * d, cy - 5.5); c.lineTo(cx + 6 * d, cy - 2.5); c.lineTo(cx + 3 * d, cy + 0.5)
        c.moveTo(cx + 6 * d, cy + 3.5); c.lineTo(cx - 6 * d, cy + 3.5); c.stroke()
      } else {                          // destello ✦
        const k = fx === 'dropflash' ? 7.5 : 6
        c.beginPath()
        for (let a = 0; a < 8; a++) { const rr = a % 2 === 0 ? k : k * 0.35, ang = (a * Math.PI) / 4 - Math.PI / 2; c.lineTo(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)) }
        c.closePath(); c.fill()
      }
      c.restore()
    }
  }

  /** Clips superpuestos (video y audio) en sus pistas. */
  private drawOverlayClips() {
    const c = this.ctx
    for (const o of this.store.project.overlays ?? []) {
      const R = (o.kind === 'video' ? this.vLanes : this.aLanes)[o.track - 1]; if (!R) continue
      const x0 = this.t2x(o.start) + 0.5, x1 = this.t2x(overlayEnd(o)) - 0.5
      if (x1 < LEFT || x0 > this.w) continue
      const w = Math.max(x1 - x0, 2), a = this.player.assets.get(o.assetId)
      const sel = this.store.selection?.type === 'overlay' && this.store.selection.id === o.id
      const name = this.store.asset(o.assetId)?.name ?? o.id
      c.save(); c.beginPath(); c.roundRect(x0, R.y, w, R.h, 3); c.clip()
      c.font = '10px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
      if (o.kind === 'video') {
        const HEAD = 14, TH = R.h - HEAD
        c.fillStyle = '#0d4f53'; c.fillRect(x0, R.y, w, R.h)
        if (a) {
          const tw = THUMB_W * (TH / THUMB_H)
          for (let tx = x0; tx < x1; tx += tw) {
            if (tx + tw < LEFT || tx > this.w) continue
            const src = o.srcIn + ((tx + tw / 2 - x0) / this.pps) * o.speed
            const th = a.thumbs[Math.min(Math.floor(src), a.thumbs.length - 1)]
            if (th) c.drawImage(th, tx, R.y + HEAD, tw, TH)
          }
        }
        c.fillStyle = '#0f6a6f'; c.fillRect(x0, R.y, w, HEAD)
        c.fillStyle = '#fff'; c.fillText(`${name}  ${tc(overlayDur(o))}`, Math.max(x0, LEFT) + 6, R.y + HEAD / 2)
      } else {
        c.fillStyle = '#143a66'; c.fillRect(x0, R.y, w, R.h)
        const pk = this.player.musicPeaks.get(o.assetId)
        if (pk) {
          c.fillStyle = '#2f86e0'; const mid = R.y + R.h / 2 + 5
          for (let x = Math.max(Math.floor(x0), LEFT); x < Math.min(x1, this.w); x++) {
            const t = o.srcIn + ((x - x0) / this.pps) * o.speed, i0 = Math.floor(t * 100), i1 = Math.max(i0 + 1, Math.floor((t + o.speed / this.pps) * 100))
            let mx = 0; for (let i = i0; i < i1 && i < pk.length; i++) if (pk[i] > mx) mx = pk[i]
            const h = Math.min(1, mx * o.volume) * (R.h - 14); c.fillRect(x, mid - h / 2, 1, Math.max(h, 1))
          }
        }
        c.fillStyle = '#fff'; c.fillText('♪ ' + name, Math.max(x0, LEFT) + 6, R.y + 8)
      }
      c.restore()
      if (sel) {
        c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.roundRect(x0 + 1, R.y + 1, w - 2, R.h - 2, 3); c.stroke()
        c.fillStyle = '#fff'; for (const xx of [x0 + 1, x1 - 7]) { c.beginPath(); c.roundRect(xx, R.y + R.h / 2 - 9, 6, 18, 3); c.fill() }
      }
    }
  }

  private drawMusic() {
    const m = this.store.project.music; if (!m) return
    const c = this.ctx, R = ROWS.music, total = duration(this.store.project)
    const x0 = this.t2x(0), x1 = this.t2x(total)
    if (x1 < LEFT || x0 > this.w) return
    const l = Math.max(x0, LEFT)
    c.save(); c.beginPath(); c.rect(l, R.y, x1 - l, R.h); c.clip()
    c.fillStyle = '#143a66'; c.beginPath(); c.roundRect(x0, R.y + 1, x1 - x0, R.h - 2, 3); c.fill()
    const pk = this.player.musicPeaks.get(m.assetId)
    if (pk) {
      c.fillStyle = '#2f86e0'; const mid = R.y + R.h / 2 + 6
      for (let x = Math.floor(l); x < Math.min(x1, this.w); x++) {
        const t = m.srcIn + (x - x0) / this.pps, i0 = Math.floor(t * 100), i1 = Math.max(i0 + 1, Math.floor((t + 1 / this.pps) * 100))
        let mx = 0; for (let i = i0; i < i1 && i < pk.length; i++) if (pk[i] > mx) mx = pk[i]
        const h = Math.min(1, mx * m.volume) * (R.h - 16); c.fillRect(x, mid - h / 2, 1, Math.max(h, 1))
      }
    }
    c.fillStyle = '#fff'; c.font = '11px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
    c.fillStyle = 'rgba(8,20,40,.6)'; c.beginPath(); c.roundRect(Math.max(x0, LEFT) + 4, R.y + 3, 230, 14, 3); c.fill()
    c.save(); c.beginPath(); c.roundRect(Math.max(x0, LEFT) + 4, R.y + 3, 230, 14, 3); c.clip()
    c.fillStyle = '#fff'; c.fillText('♪ ' + (this.store.asset(m.assetId)?.name ?? 'música'), Math.max(x0, LEFT) + 10, R.y + 10); c.restore()
    c.restore()
  }

  private drawOverlay(o: TextLayer) {
    const c = this.ctx, R = ROWS[o.type]
    const x0 = this.t2x(o.start), x1 = this.t2x(o.end)
    if (x1 < LEFT || x0 > this.w) return
    const sel = this.store.selection?.type === 'layer' && this.store.selection.id === o.id
    const l = Math.max(x0, LEFT)
    c.save()
    c.beginPath(); c.rect(l, R.y, x1 - l, R.h); c.clip()
    c.fillStyle = o.type === 'subtitle' ? '#c4553f' : '#a23b6d'
    c.beginPath(); c.roundRect(x0, R.y + 2, x1 - x0, R.h - 4, 3); c.fill()
    c.fillStyle = '#fff'; c.font = '11px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
    c.fillText('Aa≡ ' + o.text, x0 + 8, R.y + R.h / 2)
    if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.roundRect(x0 + 1, R.y + 3, x1 - x0 - 2, R.h - 6, 3); c.stroke() }
    c.restore()
  }
}
