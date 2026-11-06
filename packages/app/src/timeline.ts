import { PEAK_RATE, THUMB_H, THUMB_W } from './media'
import type { Player } from './player'
import { MIN_DUR, clipDur, duration, exec, isTextLayer, layout, type Placed, type Store, type TextLayer } from '@gojaguar/core'

const LEFT = 78, RULER_H = 26
const ROWS = {
  video: { y: 30, h: 58, label: 'Video' },
  audio: { y: 92, h: 34, label: 'Audio' },
  subtitle: { y: 132, h: 26, label: 'Subtítulos' },
  graphic: { y: 162, h: 26, label: 'Gráficos' },
} as const
export const TL_HEIGHT = 196
const EDGE = 7

type Drag =
  | { k: 'seek' }
  | { k: 'trim'; edge: 'in' | 'out'; id: string; x0: number; in0: number; out0: number; start0: number }
  | { k: 'clip'; id: string; x0: number; moved: boolean; target: number }
  | { k: 'ov'; id: string; mode: 'move' | 'l' | 'r'; x0: number; s0: number; e0: number; moved: boolean }

export class Timeline {
  ctx: CanvasRenderingContext2D
  pps = 14
  scrollX = 0
  dirty = true
  private w = 0
  private drag: Drag | null = null
  private hoverX: number | null = null
  private mouse = { x: 0, y: 0 }

  constructor(private canvas: HTMLCanvasElement, private store: Store, private player: Player) {
    this.ctx = canvas.getContext('2d')!
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!)
    store.onChange(() => { this.dirty = true })
    canvas.addEventListener('mousemove', e => this.onMove(e))
    canvas.addEventListener('mousedown', e => this.onDown(e))
    window.addEventListener('mouseup', () => this.onUp())
    window.addEventListener('mousemove', e => { if (this.drag) this.onMove(e) })
    canvas.addEventListener('mouseleave', () => { if (!this.drag) { this.hoverX = null; player.hover = null; player.dirty = true; this.dirty = true } })
    canvas.addEventListener('dblclick', e => this.onDbl(e))
    canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false })
    this.resize()
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    this.w = this.canvas.parentElement!.clientWidth
    this.canvas.style.width = this.w + 'px'
    this.canvas.style.height = TL_HEIGHT + 'px'
    this.canvas.width = Math.floor(this.w * dpr)
    this.canvas.height = Math.floor(TL_HEIGHT * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.dirty = true
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
  private rowAt(y: number): keyof typeof ROWS | 'ruler' | null {
    if (y < RULER_H) return 'ruler'
    for (const k of Object.keys(ROWS) as (keyof typeof ROWS)[]) if (y >= ROWS[k].y && y < ROWS[k].y + ROWS[k].h) return k
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
    const t = Math.min(this.x2t(x), this.total())
    this.player.hover = null

    if (row === 'ruler') { this.drag = { k: 'seek' }; this.player.seek(t); return }

    if (row === 'video' || row === 'audio') {
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
        this.hoverX = x
        this.player.hover = Math.min(this.x2t(x), Math.max(this.total() - 1e-3, 0))
        this.player.dirty = true
      } else { this.hoverX = null; this.player.hover = null; this.player.dirty = true }
      this.canvas.style.cursor = this.cursorAt(x, y)
      this.dirty = true
      return
    }

    this.dirty = true
    if (d.k === 'seek') { this.player.seek(Math.min(this.x2t(x), this.total())); return }

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
    this.player.override = null
    if (d.k === 'trim' || d.k === 'ov') this.store.endTx()
    if (d.k === 'clip' && d.moved) {
      if (d.target !== this.store.project.clips.findIndex(c => c.id === d.id)) exec(this.store, { op: 'move_clip', id: d.id, to_index: d.target })
    }
    this.player.dirty = true; this.dirty = true
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
    if (row === 'video' || row === 'audio') {
      const h = this.hitClip(x)
      return h ? (h.zone === 'body' ? 'grab' : 'ew-resize') : 'default'
    }
    if (row === 'subtitle' || row === 'graphic') {
      const h = this.hitOverlay(x, row)
      return h ? (h.zone === 'move' ? 'grab' : 'ew-resize') : 'cell'
    }
    return 'default'
  }

  // --- dibujo -----------------------------------------------------------------
  draw() {
    this.dirty = false
    const c = this.ctx, w = this.w
    const p = this.store.project
    c.clearRect(0, 0, w, TL_HEIGHT)
    c.fillStyle = '#191917'; c.fillRect(0, 0, w, TL_HEIGHT)

    // seguir el playhead durante la reproducción
    if (this.player.playing) {
      const px = this.t2x(this.player.time())
      if (px > w - 60) this.scrollX += px - (w - 60)
    }

    for (const k of Object.keys(ROWS) as (keyof typeof ROWS)[]) {
      c.fillStyle = '#232321'; c.fillRect(LEFT, ROWS[k].y, w - LEFT, ROWS[k].h)
    }
    this.drawRuler()

    const placed = layout(p)
    const dragging = this.drag?.k === 'clip' && this.drag.moved ? this.drag : null
    for (const pl of placed) this.drawClip(pl, dragging?.id === pl.clip.id)

    for (const o of p.layers) if (isTextLayer(o)) this.drawOverlay(o)

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
      c.beginPath(); c.moveTo(this.hoverX + .5, RULER_H - 6); c.lineTo(this.hoverX + .5, TL_HEIGHT); c.stroke()
    }

    // playhead
    const ph = this.t2x(this.player.playing ? this.player.time() : this.player.playhead)
    if (ph >= LEFT - 1) {
      c.strokeStyle = '#ff4d4d'; c.lineWidth = 2
      c.beginPath(); c.moveTo(ph, 0); c.lineTo(ph, TL_HEIGHT); c.stroke()
      c.fillStyle = '#ff4d4d'
      c.beginPath(); c.moveTo(ph - 6, 0); c.lineTo(ph + 6, 0); c.lineTo(ph, 10); c.closePath(); c.fill()
    }

    // gutter de etiquetas (tapa lo que se desplaza debajo)
    c.fillStyle = '#191917'; c.fillRect(0, 0, LEFT, TL_HEIGHT)
    c.fillStyle = '#a39e92'; c.font = '11px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
    for (const k of Object.keys(ROWS) as (keyof typeof ROWS)[]) c.fillText(ROWS[k].label, 10, ROWS[k].y + ROWS[k].h / 2)
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
    const x0 = this.t2x(pl.start), x1 = this.t2x(pl.end)
    if (x1 < LEFT || x0 > this.w) return
    const a = this.player.assets.get(pl.clip.assetId)
    const sel = this.store.selection?.type === 'clip' && this.store.selection.id === pl.clip.id
    const V = ROWS.video, A = ROWS.audio

    c.save()
    c.globalAlpha = ghost ? 0.35 : 1
    c.beginPath(); c.rect(Math.max(x0, LEFT), V.y, x1 - Math.max(x0, LEFT), V.h); c.clip()
    c.fillStyle = '#3a3a36'; c.fillRect(x0, V.y, x1 - x0, V.h)
    if (a) {
      const tw = THUMB_W * (V.h / THUMB_H)
      for (let tx = x0; tx < x1; tx += tw) {
        if (tx + tw < LEFT || tx > this.w) continue
        const src = pl.clip.srcIn + ((tx + tw / 2 - x0) / this.pps) * pl.clip.speed
        const th = a.thumbs[Math.min(Math.floor(src), a.thumbs.length - 1)]
        if (th) c.drawImage(th, tx, V.y, tw, V.h)
      }
    }
    c.fillStyle = 'rgba(8,9,14,.55)'; c.fillRect(x0, V.y, Math.min(150, x1 - x0), 18)
    c.fillStyle = '#fff'; c.font = '11px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
    c.fillText(`${pl.clip.id}${pl.clip.speed !== 1 ? `  ×${pl.clip.speed}` : ''}${pl.clip.volume !== 1 ? `  vol ${pl.clip.volume}` : ''}`, x0 + 6, V.y + 9)
    c.restore()

    // audio + waveform
    c.save()
    c.globalAlpha = ghost ? 0.35 : 1
    c.beginPath(); c.rect(Math.max(x0, LEFT), A.y, x1 - Math.max(x0, LEFT), A.h); c.clip()
    c.fillStyle = '#1f3a34'; c.fillRect(x0, A.y, x1 - x0, A.h)
    if (a && a.peaks.length) {
      c.fillStyle = '#4fd1a5'
      const mid = A.y + A.h / 2
      for (let x = Math.max(Math.floor(x0), LEFT); x < Math.min(x1, this.w); x++) {
        const t = pl.clip.srcIn + ((x - x0) / this.pps) * pl.clip.speed
        const i0 = Math.floor(t * PEAK_RATE)
        const i1 = Math.max(i0 + 1, Math.floor((t + (pl.clip.speed / this.pps)) * PEAK_RATE))
        let m = 0
        for (let i = i0; i < i1 && i < a.peaks.length; i++) if (a.peaks[i] > m) m = a.peaks[i]
        const h = Math.min(1, m * pl.clip.volume) * (A.h - 4)
        c.fillRect(x, mid - h / 2, 1, Math.max(h, 1))
      }
    }
    c.restore()

    // bordes
    for (const r of [V, A]) {
      c.strokeStyle = sel ? '#e8b152' : 'rgba(255,255,255,.25)'; c.lineWidth = sel ? 2 : 1
      c.strokeRect(x0 + .5, r.y + .5, x1 - x0 - 1, r.h - 1)
    }
    if (sel) {
      c.fillStyle = '#e8b152'
      for (const xx of [x0, x1 - 5]) c.fillRect(xx, V.y + V.h / 2 - 12, 5, 24)
    }
  }

  private drawOverlay(o: TextLayer) {
    const c = this.ctx, R = ROWS[o.type]
    const x0 = this.t2x(o.start), x1 = this.t2x(o.end)
    if (x1 < LEFT || x0 > this.w) return
    const sel = this.store.selection?.type === 'layer' && this.store.selection.id === o.id
    const l = Math.max(x0, LEFT)
    c.save()
    c.beginPath(); c.rect(l, R.y, x1 - l, R.h); c.clip()
    c.fillStyle = o.type === 'subtitle' ? '#8a6324' : '#c4366a'
    c.beginPath(); c.roundRect(x0, R.y + 2, x1 - x0, R.h - 4, 5); c.fill()
    c.fillStyle = '#fff'; c.font = '11px Figtree, system-ui, sans-serif'; c.textBaseline = 'middle'
    c.fillText(o.text, x0 + 8, R.y + R.h / 2)
    if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.roundRect(x0 + 1, R.y + 3, x1 - x0 - 2, R.h - 6, 5); c.stroke() }
    c.restore()
  }
}
