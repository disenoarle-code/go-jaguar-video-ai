import {
  Store, describe, duration, exec, execBatch, layout, parseProject, serialize,
  CLIP_FX, type AssetInfo, type ClipFx, type Cmd, type Project, type TextLayer,
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
  let lastJson = JSON.stringify(store.project), savedJson = lastJson
  const saveEl = $('savestate')
  const showSaved = (ok: boolean) => { saveEl.textContent = ok ? '✓ Guardado' : 'Guardando…'; saveEl.style.color = ok ? '' : '#e8b152' }
  showSaved(true)
  let autosaveTimer = 0
  async function guardar(avisar = false) {
    const rev = store.revision, snapJson = JSON.stringify(store.project)
    try {
      const r = await fetch(`/api/proyectos/${slug}/proyecto`, { method: 'PUT', body: serialize(store.project) })
      if (!r.ok) throw new Error('El servidor no pudo guardar')
      lastSavedRev = rev
      savedJson = snapJson
      showSaved(JSON.stringify(store.project) === snapJson)
      if (avisar) notify('Guardado')
    } catch (e) { notify('No se pudo guardar: ' + (e as Error).message) }
  }
  store.onChange(() => {
    if (document.activeElement !== nameEl) nameEl.value = store.project.name
    const json = JSON.stringify(store.project)      // seleccionar o mover el cabezal no cambia la edición: no se guarda
    if (json === lastJson) return
    lastJson = json
    showSaved(false)
    clearTimeout(autosaveTimer)
    autosaveTimer = window.setTimeout(() => { void guardar() }, 1200)
  })
  $('back').onclick = async () => { await guardar(); location.hash = `#/p/${slug}` }
  window.addEventListener('beforeunload', e => { if (JSON.stringify(store.project) !== savedJson) e.preventDefault() })

  // --- exportar a MP4 (lo hace el servidor con ffmpeg; aquí solo se eligen las opciones) ---
  $('export').onclick = () => { void openExport() }
  async function openExport() {
    await guardar()
    const f = store.project.format, short = Math.min(f.width, f.height)
    const dim = (s: number) => { const k = Math.min(s / short, 1); return `${Math.round(f.width * k / 2) * 2}×${Math.round(f.height * k / 2) * 2}` }
    const modal = document.createElement('div'); modal.className = 'modal'
    const box = document.createElement('div'); box.className = 'modal-box exp'; modal.append(box); document.body.append(modal)
    const close = () => { modal.remove() }
    const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const mb = (n: number) => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`
    const prev = await fetch(`/api/proyectos/${slug}/exportaciones`).then(r => r.json()).catch(() => []) as { name: string; size: number; url: string }[]

    const form = () => {
      box.innerHTML = `<h2>Exportar video</h2>
        <label>Nombre del archivo</label><input type="text" id="x-name" value="${esc(store.project.name)}" />
        <label>Resolución</label><select id="x-res"><option value="original">Original · ${f.width}×${f.height}</option><option value="720">720p · ${dim(720)}</option><option value="480">480p · ${dim(480)} (más liviano)</option></select>
        <label>Calidad</label><select id="x-cal"><option value="rapida">Rápida · se hace en menos tiempo</option><option value="buena" selected>Buena · recomendada</option><option value="maxima">Máxima · tarda más, archivo más grande</option></select>
        <p class="dim small">MP4 (H.264 + AAC) · ${f.fps} fps · ${tc(duration(store.project))} · incluye cortes, zooms, transiciones, superpuestos y música.</p>
        ${prev.length ? `<p class="dim small" style="margin-bottom:4px">Exportaciones anteriores</p><div class="prev">${prev.map(p => `<a href="/${p.url}" download="${esc(p.name)}">${esc(p.name)} <i>${mb(p.size)}</i></a>`).join('')}</div>` : ''}
        <div class="row"><button id="x-no">Cancelar</button><button class="primary" id="x-go">Exportar</button></div>`
      box.querySelector<HTMLElement>('#x-no')!.onclick = close
      box.querySelector<HTMLElement>('#x-go')!.onclick = start
    }
    const val = (id: string) => (box.querySelector(`#${id}`) as HTMLInputElement).value
    async function start() {
      const body = { nombre: val('x-name'), resolucion: val('x-res'), calidad: val('x-cal') }
      box.innerHTML = '<h2>Exportando…</h2><p class="dim" id="x-det">Preparando…</p><div class="bar2"><i id="x-bar" style="width:0%"></i></div><div class="row"><button class="danger" id="x-cancel">Cancelar exportación</button></div>'
      let job = await fetch(`/api/proyectos/${slug}/exportar`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }).then(r => r.json())
      if (job.error) { box.innerHTML = `<h2>No se pudo exportar</h2><p class="warn">${esc(job.error)}</p><div class="row"><button id="x-no">Cerrar</button></div>`; box.querySelector<HTMLElement>('#x-no')!.onclick = close; return }
      box.querySelector<HTMLElement>('#x-cancel')!.onclick = () => { void fetch(`/api/exportaciones/${encodeURIComponent(job.id)}/cancelar`, { method: 'POST' }) }
      while (job.status === 'running' && document.body.contains(modal)) {
        await new Promise(r => setTimeout(r, 600))
        job = await fetch(`/api/exportaciones/${encodeURIComponent(job.id)}`).then(r => r.json())
        const bar = box.querySelector<HTMLElement>('#x-bar'), det = box.querySelector<HTMLElement>('#x-det')
        if (bar) bar.style.width = `${Math.round(job.pct * 100)}%`
        if (det) det.textContent = `${job.detail ?? 'Renderizando…'} ${Math.round(job.pct * 100)}%`
      }
      if (job.status === 'done') {
        box.innerHTML = `<h2>✓ Video listo</h2><video src="/${job.url}" controls playsinline></video>
          <p class="dim small">${esc(job.url.split('/').pop() ?? '')} · ${mb(job.size)}</p>
          <div class="row"><button id="x-show">Mostrar en la carpeta</button><a class="btn primary" href="/${job.url}" download="${esc(decodeURIComponent(job.url.split('/').pop() ?? 'video.mp4'))}">Descargar</a><button id="x-no">Cerrar</button></div>`
        box.querySelector<HTMLElement>('#x-no')!.onclick = close
        box.querySelector<HTMLElement>('#x-show')!.onclick = () => { void fetch(`/api/proyectos/${slug}/mostrar`, { method: 'POST', body: JSON.stringify({ file: decodeURIComponent(job.url.split('/').pop() ?? '') }) }) }
      } else if (document.body.contains(modal)) {
        box.innerHTML = `<h2>${job.status === 'cancelado' ? 'Exportación cancelada' : 'No se pudo exportar'}</h2>${job.status === 'cancelado' ? '' : `<p class="warn">${esc(job.error ?? 'Error')}</p>`}<div class="row"><button id="x-back">Volver</button><button id="x-no">Cerrar</button></div>`
        box.querySelector<HTMLElement>('#x-no')!.onclick = close; box.querySelector<HTMLElement>('#x-back')!.onclick = form
      }
    }
    modal.onclick = e => { if (e.target === modal && !box.querySelector('#x-cancel')) close() }
    form()
  }

  // --- barra de herramientas ---------------------------------------------------
  const sel = () => store.selection
  $('play').onclick = () => player.toggle()
  $('undo').onclick = () => store.undo()
  $('redo').onclick = () => store.redo()
  const splitHere = () => { if (store.project.tracks?.main?.locked) { notify('La pista principal está bloqueada'); return } exec(store, { op: 'split', at: player.playhead }) }
  $('split').onclick = splitHere
  $('del').onclick = deleteSelected
  $('addsub').onclick = () => exec(store, { op: 'add_text', type: 'subtitle', start: player.playhead, end: player.playhead + 2.5, text: 'Nuevo subtítulo' })
  $('addgfx').onclick = () => exec(store, { op: 'add_text', type: 'graphic', start: player.playhead, end: player.playhead + 3, text: 'Nuevo gráfico' })
  $('zin').onclick = () => tl.zoom(1.4)
  $('zout').onclick = () => tl.zoom(1 / 1.4)
  $('zfit').onclick = () => tl.fit()
  const zoomR = $<HTMLInputElement>('zoomr')
  zoomR.oninput = () => { const target = 2 * Math.pow(300, Number(zoomR.value) / 100); tl.zoom(target / tl.pps) }

  function deleteSelected() {
    const s = sel(); if (!s) return
    exec(store, s.type === 'clip' ? { op: 'delete_clip', id: s.id } : s.type === 'overlay' ? { op: 'delete_overlay', id: s.id } : s.type === 'music' ? { op: 'clear_music' } : { op: 'delete_layer', id: s.id })
    store.select(null)
  }

  window.addEventListener('keydown', e => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
    const mod = e.metaKey || e.ctrlKey
    if (e.code === 'Space') { e.preventDefault(); player.toggle() }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void guardar(true) }
    else if (e.key === 's' && !mod) splitHere()
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

  // El botón Material de la barra lleva al panel de medios (lo que se muestra cuando no hay nada seleccionado)
  $('addmat').onclick = () => { store.select(null); lastKey = ''; renderInspector() }

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
    if (key === 'none' && lastKey === 'none') { updatePool(); return }
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
    } else if (s?.type === 'music' && store.project.music) {
      const m = store.project.music, nm = (store.asset(m.assetId)?.name ?? 'música').replace(/[<&]/g, '')
      insp.insertAdjacentHTML('beforeend', `<h3>Música</h3><p class="hint" style="margin:0">${nm}</p>`)
      field('Volumen', input('range', m.volume, (pr, v) => { if (pr.music) pr.music.volume = parseFloat(v) }, { min: '0', max: '2', step: '0.05' }))
      field('Empieza en (s de la canción)', input('number', m.srcIn.toFixed(2), (pr, v) => { if (pr.music) pr.music.srcIn = Math.max(0, parseFloat(v) || 0) }, { step: '0.05', min: '0' }))
      field('Fundido final (s)', input('number', m.fadeOut, (pr, v) => { if (pr.music) pr.music.fadeOut = Math.max(0, parseFloat(v) || 0) }, { step: '0.1', min: '0' }))
      const rm = document.createElement('button'); rm.textContent = 'Quitar música'; rm.style.marginTop = '12px'; rm.onclick = deleteSelected
      insp.append(rm)
    } else {
      buildPool()
    }
  }

  // --- biblioteca de medios (como CapCut): lo que se ve cuando no hay nada seleccionado -------------------
  let poolSig = '', poolQuery = ''
  const used = () => new Set<string>([...store.project.clips.map(c => c.assetId), ...(store.project.overlays ?? []).map(o => o.assetId), ...(store.project.music ? [store.project.music.assetId] : [])])
  function drawCard(cv: HTMLCanvasElement, a: AssetInfo, tries = 0) {
    const g = cv.getContext('2d')!, W2 = cv.width, H2 = cv.height
    const la = player.assets.get(a.id)
    if (a.kind === 'audio') {
      g.fillStyle = '#143a66'; g.fillRect(0, 0, W2, H2)
      const pk = player.musicPeaks.get(a.id)
      if (!pk) { if (tries < 20) setTimeout(() => drawCard(cv, a, tries + 1), 500); return }
      g.fillStyle = '#2f86e0'
      for (let x = 0; x < W2; x += 3) { const i0 = Math.floor((x / W2) * pk.length), i1 = Math.max(i0 + 1, Math.floor(((x + 3) / W2) * pk.length)); let mx = 0; for (let i = i0; i < i1; i++) if (pk[i] > mx) mx = pk[i]; const h = Math.max(2, mx * (H2 - 14)); g.fillRect(x, (H2 - h) / 2 + 3, 2, h) }
      return
    }
    g.fillStyle = '#26261f'; g.fillRect(0, 0, W2, H2)
    const th = la?.thumbs ?? [], N = 8, tw = W2 / N
    for (let i = 0; i < N; i++) {
      const bm = th[Math.min(th.length - 1, Math.floor(((i + 0.5) / N) * a.duration))]
      if (!bm) continue
      const sw = Math.min(bm.width, bm.height * (tw / H2)), sx = (bm.width - sw) / 2     // recorte al centro, sin estirar
      g.drawImage(bm, sx, 0, sw, bm.height, i * tw, 0, tw + 0.5, H2)
    }
    if (th.length < Math.ceil(a.duration) && tries < 24) setTimeout(() => drawCard(cv, a, tries + 1), 600)
  }
  const mmss = (t: number) => { const n = Math.round(t); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` }
  function addAt(a: AssetInfo) { exec(store, { op: 'add_overlay', asset: a.id, start: player.playhead }); const o = store.project.overlays?.at(-1); if (o) store.select({ type: 'overlay', id: o.id }) }
  function poolList() {
    const list = insp.querySelector<HTMLElement>('.pool-list'); if (!list) return
    list.innerHTML = ''
    const q = poolQuery.trim().toLowerCase(), u = used()
    const items = store.project.assets.filter(a => !q || a.name.toLowerCase().includes(q))
    if (!items.length) list.innerHTML = `<p class="hint">${store.project.assets.length ? 'Sin resultados.' : 'Aún no hay archivos. Pulsa Importar.'}</p>`
    for (const a of items) {
      const box = document.createElement('div'); box.className = 'pool-item'
      const card = document.createElement('div'); card.className = 'pcard'; card.draggable = true
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 112; card.append(cv)
      card.insertAdjacentHTML('beforeend', `${u.has(a.id) ? '<span class="pbadge">Agregado</span>' : ''}<span class="pdur">${mmss(a.duration)}</span><button class="padd" title="Agregar en el cabezal">+</button>`)
      card.querySelector<HTMLElement>('.padd')!.onclick = e => { e.stopPropagation(); addAt(a) }
      card.ondragstart = ev => { ev.dataTransfer!.setData('text/gojaguar-asset', a.id); ev.dataTransfer!.effectAllowed = 'copy'; tl.showDropLane(a.kind === 'audio' ? 'audio' : 'video') }
      card.ondragend = () => tl.showDropLane(null)
      box.append(card); box.insertAdjacentHTML('beforeend', `<div class="pname" title="${a.name.replace(/["<&]/g, '')}">${a.name.replace(/[<&]/g, '')}</div>`)
      list.append(box); drawCard(cv, a)
    }
  }
  const poolSignature = () => JSON.stringify([store.project.assets.map(a => a.id), [...used()].sort(), poolQuery])
  function updatePool() { const sig = poolSignature(); if (sig !== poolSig && insp.querySelector('.pool')) { poolSig = sig; poolList() } }
  function buildPool() {
    insp.innerHTML = `<div class="pool"><div class="pool-top"><button id="p-import" class="pimp" title="Elige archivos de tu computador: se enlazan, no se copian"><b>+</b> Importar</button><input id="p-q" type="text" placeholder="Buscar" /></div><div class="pool-title">Todo</div><div class="pool-list"></div><p class="pool-note dim" id="p-note"></p></div>`
    const q = insp.querySelector<HTMLInputElement>('#p-q')!; q.value = poolQuery
    q.oninput = () => { poolQuery = q.value; poolSig = ''; updatePool() }
    insp.querySelector<HTMLElement>('#p-import')!.onclick = async ev => {
      const btn = ev.currentTarget as HTMLButtonElement, note = insp.querySelector<HTMLElement>('#p-note')!
      btn.disabled = true; btn.innerHTML = 'Elige los archivos…'
      try {
        await fetch(`/api/proyectos/${slug}/material/elegir`, { method: 'POST' }).then(r => r.json())
        btn.innerHTML = 'Preparando…'
        const r = await fetch(`/api/proyectos/${slug}/preparar`, { method: 'POST' }).then(r => r.json())
        if (r.error) throw new Error(r.error)
        if (r.assets.length) { execBatch(store, r.assets.map((a: AssetInfo) => ({ op: 'import_asset', asset: a }) as Cmd)); await loadMedia() }
        note.textContent = r.omitidos.length ? `Todavía no se pueden usar en el editor: ${r.omitidos.join(', ')} (imágenes u otros formatos).` : ''
      } catch (e) { note.textContent = (e as Error).message }
      btn.disabled = false; btn.innerHTML = '<b>+</b> Importar'
      poolSig = ''; updatePool()
    }
    poolSig = ''; updatePool()
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
    const zv = (100 * Math.log(tl.pps / 2)) / Math.log(300)
    if (document.activeElement !== zoomR && Math.abs(Number(zoomR.value) - zv) > 0.4) zoomR.value = String(zv)
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

