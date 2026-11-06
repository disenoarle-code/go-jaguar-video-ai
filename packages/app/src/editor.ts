import {
  Store, describe, duration, exec, execBatch, layout, parseProject, serialize,
  CLIP_FX, type ClipFx, type Cmd, type Project, type TextLayer,
} from '@gojaguar/core'
import { FX_INFO, TRANSITIONS } from './fxinfo'
import { H, W } from './constants'
import { ico } from './icons'
import { runBench } from './bench'
import { loadAsset } from './media'
import { hitOverlay } from './overlays'
import { Player } from './player'
import { Timeline } from './timeline'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`

export async function bootEditor(slug: string) {
  const res = await fetch(`/api/proyectos/${slug}/proyecto`)
  if (!res.ok) { $('loading').innerHTML = `${(await res.json().catch(() => ({ error: 'Error' }))).error}<br><a href="#/p/${slug}">${ico('arrow-left')} Volver al proyecto</a>`; return }
  const store = new Store(parseProject(await res.text()))
  store.load(store.project)   // el estado inicial no es deshacible
  const player = new Player($('preview') as HTMLCanvasElement, store)
  const tl = new Timeline($('timeline') as HTMLCanvasElement, store, player)

  /** Carga los medios que el proyecto usa y aún no están en memoria. */
  const loadingIds = new Set<string>()
  async function loadMedia() {
    for (const info of store.project.assets) {
      if (player.assets.has(info.id) || player.music.has(info.id) || loadingIds.has(info.id)) continue
      loadingIds.add(info.id)
      if (info.kind === 'audio') {
        try { player.addMusic(info.id, await player.actx.decodeAudioData(await (await fetch(`/${info.proxy}`)).arrayBuffer())); tl.dirty = true }
        catch (e) { notify(`No se pudo cargar la música "${info.name}": ${(e as Error).message}`) }
        continue
      }
      try { player.assets.set(info.id, await loadAsset(info, player.actx, () => { tl.dirty = true })) }
      catch (e) { notify(`No se pudo cargar "${info.name}": ${(e as Error).message}`) }
    }
    player.ensureStretched()
  }
  await loadMedia()
  $('loading').remove()
  requestAnimationFrame(() => { tl.fit(); player.seek(0) })

  // --- avisos y nombre del proyecto ------------------------------------------------
  const noteEl = $('note')
  let noteTimer = 0
  function notify(msg: string) {
    noteEl.textContent = msg
    clearTimeout(noteTimer); noteTimer = window.setTimeout(() => { noteEl.textContent = '' }, 5000)
  }
  const nameEl = $<HTMLInputElement>('pname')
  nameEl.value = store.project.name
  nameEl.addEventListener('change', () => store.mutate(p => { p.name = nameEl.value.trim() || 'Proyecto sin título' }))

  // --- guardado en la carpeta del proyecto (autoguardado + botón) -----------------------------------------
  let lastSavedRev = store.revision
  let autosaveTimer = 0
  async function guardar(avisar = false) {
    const rev = store.revision
    try {
      const r = await fetch(`/api/proyectos/${slug}/proyecto`, { method: 'PUT', body: serialize(store.project) })
      if (!r.ok) throw new Error('El servidor no pudo guardar')
      lastSavedRev = rev
      if (avisar) notify('Guardado')
    } catch (e) { notify('No se pudo guardar: ' + (e as Error).message) }
  }
  store.onChange(() => {
    if (document.activeElement !== nameEl) nameEl.value = store.project.name
    clearTimeout(autosaveTimer)
    autosaveTimer = window.setTimeout(() => { void guardar() }, 1200)
  })
  $('save').onclick = () => guardar(true)
  $('back').onclick = async () => { await guardar(); location.hash = `#/p/${slug}` }
  window.addEventListener('beforeunload', e => { if (store.revision !== lastSavedRev) e.preventDefault() })

  // --- barra de herramientas ---------------------------------------------------
  const sel = () => store.selection
  $('play').onclick = () => player.toggle()
  $('undo').onclick = () => store.undo()
  $('redo').onclick = () => store.redo()
  $('split').onclick = () => exec(store, { op: 'split', at: player.playhead })
  $('del').onclick = deleteSelected
  $('addsub').onclick = () => exec(store, { op: 'add_text', type: 'subtitle', start: player.playhead, end: player.playhead + 2.5, text: 'Nuevo subtítulo' })
  $('addgfx').onclick = () => exec(store, { op: 'add_text', type: 'graphic', start: player.playhead, end: player.playhead + 3, text: 'Nuevo gráfico' })
  $('zin').onclick = () => tl.zoom(1.4)
  $('zout').onclick = () => tl.zoom(1 / 1.4)
  $('zfit').onclick = () => tl.fit()

  function deleteSelected() {
    const s = sel(); if (!s) return
    exec(store, s.type === 'clip' ? { op: 'delete_clip', id: s.id } : s.type === 'overlay' ? { op: 'delete_overlay', id: s.id } : { op: 'delete_layer', id: s.id })
    store.select(null)
  }

  window.addEventListener('keydown', e => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    const mod = e.metaKey || e.ctrlKey
    if (e.code === 'Space') { e.preventDefault(); player.toggle() }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void guardar(true) }
    else if (e.key === 's' && !mod) exec(store, { op: 'split', at: player.playhead })
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected() }
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo() }
    else if (e.key === 'ArrowLeft') player.seek(player.playhead - 1 / 30)
    else if (e.key === 'ArrowRight') player.seek(player.playhead + 1 / 30)
  })

  // --- arrastrar gráficos/subtítulos directamente sobre el video ---------------
  const cv = player.canvas
  const toVideo = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  let pdrag: { id: string; dx: number; dy: number } | null = null
  cv.addEventListener('mousedown', e => {
    const m = toVideo(e)
    const o = hitOverlay(player.ctx, store.project, player.time(), m.x, m.y)
    if (!o) { store.select(null); return }
    store.select({ type: 'layer', id: o.id })
    store.beginTx()
    pdrag = { id: o.id, dx: o.transform.x * W - m.x, dy: o.transform.y * H - m.y }
  })
  cv.addEventListener('mousemove', e => {
    const m = toVideo(e)
    cv.style.cursor = hitOverlay(player.ctx, store.project, player.time(), m.x, m.y) ? 'move' : 'default'
  })
  window.addEventListener('mousemove', e => {
    if (!pdrag) return
    const m = toVideo(e)
    store.live(p => {
      const l = p.layers.find(q => q.id === pdrag!.id)!
      l.transform.x = Math.min(Math.max((m.x + pdrag!.dx) / W, 0), 1)
      l.transform.y = Math.min(Math.max((m.y + pdrag!.dy) / H, 0), 1)
    })
    player.dirty = true
  })
  window.addEventListener('mouseup', () => { if (pdrag) { store.endTx(); pdrag = null } })

  // --- panel Material: archivos del proyecto para poner sobre la línea de tiempo (clic = en el cabezal, o arrastrar) ---
  let bin: HTMLElement | null = null
  const closeBin = () => { bin?.remove(); bin = null }
  $('addmat').onclick = e => {
    e.stopPropagation()
    if (bin) { closeBin(); return }
    const m = document.createElement('div'); m.className = 'cutmenu bin'
    m.innerHTML = '<h4>Material · clic para agregar en el cabezal, o arrástralo a una pista</h4>'
    const assets = store.project.assets
    if (!assets.length) m.insertAdjacentHTML('beforeend', '<p class="hint">Este proyecto aún no tiene archivos preparados.</p>')
    for (const a of assets) {
      const b = document.createElement('button'); b.draggable = true; b.className = 'binitem'
      b.innerHTML = `<span>${a.kind === 'audio' ? '♪' : '▶'}</span><b>${a.name.replace(/[<&]/g, '')}</b><i>${tc(a.duration)}</i>`
      b.onclick = () => { exec(store, { op: 'add_overlay', asset: a.id, start: player.playhead }); const o = store.project.overlays?.at(-1); if (o) store.select({ type: 'overlay', id: o.id }) }
      b.ondragstart = ev => { ev.dataTransfer!.setData('text/gojaguar-asset', a.id); ev.dataTransfer!.effectAllowed = 'copy' }
      m.append(b)
    }
    document.body.append(m); bin = m
    const r = $('addmat').getBoundingClientRect(), w = m.offsetWidth
    m.style.left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8) + 'px'
    m.style.top = Math.max(8, r.top - m.offsetHeight - 8) + 'px'
  }
  window.addEventListener('mousedown', e => { if (bin && !bin.contains(e.target as Node) && e.target !== $('addmat')) closeBin() }, true)
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeBin() })

  // --- menú de transición al tocar un corte entre dos clips ---------------------------------
  let cutMenu: HTMLElement | null = null
  const closeCutMenu = () => { cutMenu?.remove(); cutMenu = null }
  tl.onCutClick = (clipId, cx, cy) => {
    closeCutMenu()
    const clip = store.project.clips.find(c => c.id === clipId); if (!clip) return
    const m = document.createElement('div'); m.className = 'cutmenu'
    const opts: { label: string; fx: ClipFx | null; dir?: 1 | -1 }[] = [
      { label: 'Deslizar · entra desde la derecha', fx: 'slide', dir: -1 },
      { label: 'Deslizar · entra desde la izquierda', fx: 'slide', dir: 1 },
      { label: 'Golpe + destello', fx: 'punchflash' },
      { label: 'Entrada fuerte', fx: 'dropflash' },
    ]
    const has = !!clip.fx && TRANSITIONS.has(clip.fx)
    m.innerHTML = `<h4>Transición en el corte</h4>`
    for (const o of opts) {
      const b = document.createElement('button'); b.textContent = o.label
      if (clip.fx === o.fx && (o.dir === undefined || clip.fxDir === o.dir)) b.classList.add('on')
      b.onclick = () => {
        exec(store, { op: 'set_effect', clip: clipId, effect: o.fx, dir: o.dir })
        closeCutMenu()
        const pl = layout(store.project).find(x => x.clip.id === clipId)   // muestra el resultado un instante
        if (pl) { player.seek(Math.max(0, pl.start - 0.5)); void player.play(); setTimeout(() => { if (player.playing && player.time() < pl.start + 1.2) player.pause() }, 1700) }
      }
      m.append(b)
    }
    if (has) { const b = document.createElement('button'); b.textContent = 'Quitar transición'; b.className = 'danger'; b.onclick = () => { exec(store, { op: 'set_effect', clip: clipId, effect: null }); closeCutMenu() }; m.append(b) }
    if (clip.fx && !TRANSITIONS.has(clip.fx)) m.insertAdjacentHTML('beforeend', '<p class="hint">Reemplaza el zoom de este clip.</p>')
    document.body.append(m); cutMenu = m
    const w = m.offsetWidth, h = m.offsetHeight
    m.style.left = Math.min(Math.max(8, cx - w / 2), window.innerWidth - w - 8) + 'px'
    m.style.top = Math.max(8, cy - h - 8) + 'px'
  }
  window.addEventListener('mousedown', e => { if (cutMenu && !cutMenu.contains(e.target as Node)) closeCutMenu() }, true)
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeCutMenu() })

  // --- inspector -----------------------------------------------------------------
  const insp = $('inspector')
  let lastKey = ''
  function field(label: string, el: HTMLElement) {
    const l = document.createElement('label'); l.textContent = label
    insp.append(l, el)
  }
  /** Los setters reciben el proyecto ACTUAL (no una referencia vieja), así sobreviven a deshacer/rehacer. */
  function input(type: string, value: string | number, set: (p: Project, v: string) => void, attrs: Record<string, string> = {}) {
    const el = document.createElement('input'); el.type = type; el.value = String(value)
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    el.addEventListener('focus', () => store.beginTx())
    el.addEventListener('blur', () => store.endTx())
    el.addEventListener('input', () => store.live(p => set(p, el.value)))
    return el
  }
  function renderInspector() {
    const s = sel()
    const p = store.project
    const clip = s?.type === 'clip' ? p.clips.find(c => c.id === s.id) : undefined
    const lay = s?.type === 'layer' ? p.layers.find(o => o.id === s.id) : undefined
    const ov = s?.type === 'overlay' ? p.overlays?.find(o => o.id === s.id) : undefined
    const key = s ? `${s.type}:${s.id}:${clip?.fx ?? ''}:${clip?.fxDir ?? ''}` : 'none'
    if (key === lastKey && key !== 'none') return
    if (lastKey.startsWith('overlay') && key.startsWith('overlay') && insp.contains(document.activeElement)) return   // no pisar lo que se está escribiendo
    if (key === 'none' && lastKey === 'none') { const pre = insp.querySelector('pre'); if (pre) pre.textContent = describe(store); return }
    lastKey = key
    insp.innerHTML = ''
    if (clip) {
      const id = clip.id
      const C = (pr: Project) => pr.clips.find(c => c.id === id)!
      insp.insertAdjacentHTML('beforeend', `<h3>Clip ${id}</h3>`)
      // efecto del clip (zoom, deslizar, destello…)
      const fxSel = document.createElement('select')
      const opt = (f: ClipFx) => `<option value="${f}">${FX_INFO[f].name}</option>`
      fxSel.innerHTML = '<option value="">Ninguno</option>'
        + `<optgroup label="Zoom del clip">${CLIP_FX.filter(f => !TRANSITIONS.has(f)).map(opt).join('')}</optgroup>`
        + `<optgroup label="Transición (en el corte, al entrar este clip)">${CLIP_FX.filter(f => TRANSITIONS.has(f)).map(opt).join('')}</optgroup>`
      fxSel.value = clip.fx ?? ''
      fxSel.onchange = () => { exec(store, { op: 'set_effect', clip: id, effect: (fxSel.value || null) as ClipFx | null, dir: clip.fxDir ?? 1 }) }
      field('Zoom o transición', fxSel)
      if (clip.fx) insp.insertAdjacentHTML('beforeend', `<p class="hint" style="margin:6px 0 0">${FX_INFO[clip.fx].hint}</p>`)
      if (clip.fx === 'slide') {
        const dSel = document.createElement('select')
        dSel.innerHTML = '<option value="-1">Entra desde la derecha</option><option value="1">Entra desde la izquierda</option>'
        dSel.value = String(clip.fxDir ?? 1)
        dSel.onchange = () => { exec(store, { op: 'set_effect', clip: id, effect: 'slide', dir: Number(dSel.value) as 1 | -1 }) }
        field('Dirección', dSel)
      }
      const see = document.createElement('button'); see.textContent = 'Ver este clip'; see.style.marginTop = '10px'
      see.onclick = () => { const pl = layout(store.project).find(x => x.clip.id === id); if (pl) { player.seek(pl.start); void player.play() } }
      insp.append(see)
      field('Velocidad (×)', input('number', clip.speed, (pr, v) => { const n = parseFloat(v); if (n > 0) C(pr).speed = Math.min(Math.max(n, 0.1), 8) }, { step: '0.1', min: '0.1', max: '8' }))
      field('Volumen', input('range', clip.volume, (pr, v) => { C(pr).volume = parseFloat(v) }, { min: '0', max: '2', step: '0.05' }))
      const b = document.createElement('button'); b.textContent = 'Borrar clip (ripple)'; b.style.marginTop = '14px'; b.onclick = deleteSelected
      insp.append(b)
    } else if (ov) {
      const id = ov.id, O = (pr: Project) => pr.overlays!.find(o => o.id === id)!
      const asset = store.asset(ov.assetId)
      insp.insertAdjacentHTML('beforeend', `<h3>${ov.kind === 'video' ? 'Video superpuesto' : 'Audio'} · pista ${ov.track + (ov.kind === 'video' ? 1 : 0)}</h3><p class="hint" style="margin:0">${(asset?.name ?? '').replace(/[<&]/g, '')}</p>`)
      field('Volumen', input('range', ov.volume, (pr, v) => { O(pr).volume = parseFloat(v) }, { min: '0', max: '2', step: '0.05' }))
      field('Inicio (s)', input('number', ov.start.toFixed(2), (pr, v) => { O(pr).start = Math.max(0, parseFloat(v) || 0) }, { step: '0.1', min: '0' }))
      if (ov.kind === 'video') {
        field('Tamaño', input('range', ov.transform.scale, (pr, v) => { O(pr).transform.scale = parseFloat(v) }, { min: '0.1', max: '2', step: '0.01' }))
        field('Posición horizontal', input('range', ov.transform.x, (pr, v) => { O(pr).transform.x = parseFloat(v) }, { min: '0', max: '1', step: '0.01' }))
        field('Posición vertical', input('range', ov.transform.y, (pr, v) => { O(pr).transform.y = parseFloat(v) }, { min: '0', max: '1', step: '0.01' }))
        field('Opacidad', input('range', ov.transform.opacity, (pr, v) => { O(pr).transform.opacity = parseFloat(v) }, { min: '0', max: '1', step: '0.05' }))
      }
      const b = document.createElement('button'); b.textContent = 'Quitar de la línea de tiempo'; b.style.marginTop = '14px'; b.onclick = deleteSelected
      insp.append(b)
    } else if (lay && (lay.type === 'subtitle' || lay.type === 'graphic')) {
      const id = lay.id
      const T = (pr: Project) => pr.layers.find(o => o.id === id) as TextLayer
      insp.insertAdjacentHTML('beforeend', `<h3>${lay.type === 'subtitle' ? 'Subtítulo' : 'Gráfico'} ${id}</h3>`)
      field('Texto', input('text', lay.text, (pr, v) => { T(pr).text = v }))
      field('Tamaño', input('number', lay.size, (pr, v) => { T(pr).size = Math.max(10, parseFloat(v) || 10) }, { min: '10', max: '200' }))
      field('Color', input('color', lay.color, (pr, v) => { T(pr).color = v }))
      field('Inicio (s)', input('number', lay.start.toFixed(2), (pr, v) => { T(pr).start = Math.max(0, parseFloat(v) || 0) }, { step: '0.1' }))
      field('Fin (s)', input('number', lay.end.toFixed(2), (pr, v) => { const l = T(pr); l.end = Math.max(l.start + 0.1, parseFloat(v) || 0) }, { step: '0.1' }))
      const b = document.createElement('button'); b.textContent = 'Borrar'; b.style.marginTop = '14px'; b.onclick = deleteSelected
      insp.append(b)
    } else {
      const m = store.project.music
      if (m) {
        const nm = store.asset(m.assetId)?.name ?? 'música'
        insp.insertAdjacentHTML('beforeend', `<h3>Música · ${nm}</h3>`)
        field('Volumen', input('range', m.volume, (pr, v) => { if (pr.music) pr.music.volume = parseFloat(v) }, { min: '0', max: '2', step: '0.05' }))
        field('Empieza en (s de la canción)', input('number', m.srcIn.toFixed(2), (pr, v) => { if (pr.music) pr.music.srcIn = Math.max(0, parseFloat(v) || 0) }, { step: '0.05', min: '0' }))
        field('Fundido final (s)', input('number', m.fadeOut, (pr, v) => { if (pr.music) pr.music.fadeOut = Math.max(0, parseFloat(v) || 0) }, { step: '0.1', min: '0' }))
        const rm = document.createElement('button'); rm.textContent = 'Quitar música'; rm.style.marginTop = '10px'; rm.onclick = () => { exec(store, { op: 'clear_music' }); lastKey = '' }
        insp.append(rm)
      }
      const legend = CLIP_FX.map(f => `<div class="lg"><i style="background:${FX_INFO[f].color}"></i><b>${FX_INFO[f].name}</b><span>${FX_INFO[f].hint}</span></div>`).join('')
      insp.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">Zooms y transiciones</h3><div class="legend">${legend}</div><p class="hint">Los <b>zooms</b> aparecen como una etiqueta dentro del clip. Las <b>transiciones</b> son la pastilla blanca en el corte entre dos clips: tócala (o toca el clip) para cambiarla.</p>`)
      insp.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">Lo que lee Claude</h3><pre></pre>
        <p class="hint">Pasa el mouse por el timeline para ver los frames. Arrastra los bordes de un clip para recortar (ves el frame del corte en vivo). Arrastra los gráficos y subtítulos directo sobre el video o por su barra. Doble clic en las filas de Subtítulos/Gráficos crea uno nuevo.<br><br>
        <b>S</b> corta · <b>Espacio</b> reproduce · <b>Supr</b> borra · <b>⌘/Ctrl+Z</b> deshace · <b>⌘/Ctrl+S</b> guarda · Ctrl/⌘+rueda = zoom</p>`)
      insp.querySelector('pre')!.textContent = describe(store)
    }
  }
  store.onChange(() => { renderInspector(); tl.dirty = true; player.dirty = true })
  renderInspector()

  // --- bucle principal ---------------------------------------------------------
  const timeEl = $('time'), statsEl = $('stats')
  let n = 0, shownPlaying = false
  function frame() {
    player.tick()
    if (tl.dirty || player.playing) tl.draw()
    timeEl.textContent = `${tc(player.time())} / ${tc(duration(store.project))}`
    if (player.playing !== shownPlaying) { shownPlaying = player.playing; $('play').innerHTML = ico(shownPlaying ? 'pause' : 'play') }
    ;($('undo') as HTMLButtonElement).disabled = !store.canUndo
    ;($('redo') as HTMLButtonElement).disabled = !store.canRedo
    if (++n % 20 === 0) {
      const dec = [...player.assets.values()].reduce((s, a) => s + a.source.stats.decoded, 0)
      statsEl.textContent = `${player.audioStatus ? player.audioStatus + ' · ' : ''}${player.fps.shown} fps · ${dec} frames decodificados · ${layout(store.project).length} clips`
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // API para que Claude (o los tests) controlen el editor con los mismos comandos que la UI
  ;(window as any).editor = {
    store, player, tl,
    exec: (c: Cmd) => { const r = exec(store, c); void loadMedia(); return r },
    batch: (cs: Cmd[]) => { const r = execBatch(store, cs); void loadMedia(); return r },   // carga también la música recién importada   // varios comandos = una sola entrada de deshacer
    describe: () => describe(store),
    serialize: () => serialize(store.project),
    snapshot: () => player.snapshotDataUrl(),
    bench: () => runBench(player, store),
  }
}

