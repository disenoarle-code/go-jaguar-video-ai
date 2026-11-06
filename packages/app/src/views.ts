import { api, fmtDur, fmtSize, subir, type ArchivoInfo, type Miniatura, type ProyectoInfo, type ProyectoResumen, type Referencia, type Trabajo } from './api'

const root = () => document.getElementById('shell')!
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const VIDEO = /\.(mp4|mov|m4v|mkv|webm|avi)$/i
const go = (hash: string) => { location.hash = hash }
const BRAND = '<a class="brand" href="#/"><img src="/logo.svg" alt="Go Jaguar" /><span>Video AI</span></a>'

/** Confirmación dentro de la página (el confirm() del navegador no aparece en algunos visores y cancela solo). */
function confirmar(titulo: string, textoHtml: string, ok = 'Borrar', peligro = true): Promise<boolean> {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal'
    m.innerHTML = `<div class="modal-box"><h2>${esc(titulo)}</h2><p class="dim">${textoHtml}</p>
      <div class="row"><button id="c-no">Cancelar</button><button class="${peligro ? 'danger' : 'primary'}" id="c-si">${esc(ok)}</button></div></div>`
    document.body.appendChild(m)
    const fin = (v: boolean) => { m.remove(); resolve(v) }
    m.querySelector<HTMLElement>('#c-no')!.onclick = () => fin(false)
    m.querySelector<HTMLElement>('#c-si')!.onclick = () => fin(true)
    m.onclick = e => { if (e.target === m) fin(false) }
  })
}

// --- tarjetas con miniatura reproducible -------------------------------------------------------------
const thumb = (pv: Miniatura) => pv.video
  ? `<video src="/${pv.video}" ${pv.poster ? `poster="/${pv.poster}"` : ''} controls preload="none" playsinline></video>`
  : `<div class="ph">${pv.poster ? `<img src="/${pv.poster}" alt="">` : ''}<span>${pv.poster ? 'Preparando video…' : 'Preparando miniatura…'}</span></div>`

const modoChip = (modo: 'enlace' | 'copia', existe: boolean) => !existe
  ? '<span class="miss" title="Moviste o borraste el original">⚠ no encontrado</span>'
  : modo === 'enlace' ? '<span class="dim small" title="Está en su carpeta original; no ocupa espacio extra">🔗 enlazado</span>'
  : '<span class="dim small" title="Se copió dentro del proyecto y ocupa espacio">📁 copia</span>'

const tilesMat = (m: ProyectoInfo['material']) => m.length ? m.map(f => `
  <div class="tile ${f.existe ? '' : 'missing'}"><div class="thumb">${thumb(f.preview)}</div>
    <div class="cap"><span class="nm" title="${esc(f.name)}">${esc(f.name)}</span>
      <span class="dim small">${fmtSize(f.size)}</span>${modoChip(f.modo, f.existe)}
      ${!f.existe && f.modo === 'enlace' ? `<button class="mini" data-ubicar="${esc(f.id)}">Ubicar</button>` : ''}
      <button class="trash" data-del="${esc(f.id)}" data-nombre="${esc(f.name)}" data-modo="${f.modo}" title="${f.modo === 'enlace' ? 'Quitar del proyecto (tu archivo no se borra)' : 'Borrar la copia del proyecto'}">🗑</button></div>
  </div>`).join('') : '<p class="dim">Aún no agregas videos.</p>'

const tilesRef = (refs: Referencia[], linked: Set<string>) => refs.length ? refs.map(r => `
  <div class="tile ${linked.has(r.id) ? 'sel' : ''} ${r.existe ? '' : 'missing'}"><div class="thumb">${thumb(r.preview)}</div>
    <div class="cap"><label class="nm" title="${esc(r.nombre)}"><input type="checkbox" data-ref="${esc(r.id)}" ${linked.has(r.id) ? 'checked' : ''}/> ${esc(r.nombre)}</label>
      <span class="dim small">${fmtSize(r.size)}${r.perfilDeEstilo ? ' · estilo ✓' : ''}</span>${modoChip(r.modo, r.existe)}
      ${!r.existe && r.modo === 'enlace' ? `<button class="mini" data-ubicarref="${esc(r.id)}">Ubicar</button>` : ''}
      <button class="trash" data-delref="${esc(r.id)}" data-nombre="${esc(r.nombre)}" data-modo="${r.modo}" title="${r.modo === 'enlace' ? 'Quitar de la biblioteca (tu archivo no se borra)' : 'Borrar la copia de la biblioteca'}">🗑</button></div>
  </div>`).join('') : '<p class="dim">Aún no hay referencias. Agrega una abajo.</p>'

const signature = (info: ProyectoInfo, refs: Referencia[]) =>
  JSON.stringify([info.material.map(f => [f.id, f.preview.listo, f.existe, f.modo]), refs.map(r => [r.id, r.preview.listo, r.existe, r.modo])])

const cardThumb = (pv: ProyectoResumen['preview']) => !pv
  ? '<div class="ph"><span>Sin video aún</span></div>'
  : pv.video
    ? `<video src="/${pv.video}" ${pv.poster ? `poster="/${pv.poster}"` : ''} controls preload="none" playsinline></video>`
    : `<div class="ph">${pv.poster ? `<img src="/${pv.poster}" alt="">` : ''}<span>Preparando vista previa…</span></div>`

const tarjetas = (ps: ProyectoResumen[]) => ps.map(p => `
  <div class="card">
    <button class="trash cardtrash" data-delproj="${p.slug}" data-nombre="${esc(p.name)}" title="Borrar proyecto">🗑</button>
    <div class="thumb">${cardThumb(p.preview)}</div>
    <button class="cardlink" data-slug="${p.slug}">
      <div class="card-title">${esc(p.name)}</div>
      <div class="chips">
        ${p.procesado ? '<span class="chip ok">Editado</span>' : `<span class="chip">${p.material ? `${p.material} video${p.material > 1 ? 's' : ''}` : 'Sin material'}</span>`}
        ${p.duracion ? `<span class="chip">${fmtDur(p.duracion)}</span>` : ''}
      </div>
      <div class="dim small">Última edición - ${new Date(p.ultimaEdicion).toLocaleDateString()}</div>
    </button>
  </div>`).join('')

const prevSig = (ps: ProyectoResumen[]) => JSON.stringify(ps.map(p => [p.slug, p.preview?.video, p.preview?.poster, p.preview?.listo, p.duracion, p.procesado, p.material, p.ultimaEdicion]))

// ------------------------------------------------------------------------------------------------
// HOME: proyectos
// ------------------------------------------------------------------------------------------------
export async function renderHome() {
  root().innerHTML = '<div class="page"><p class="dim">Cargando…</p></div>'
  const st = await api.estado()
  const t = st.herramientas
  const faltan: string[] = []
  if (!t.ffmpeg || !t.ffprobe) faltan.push('<b>ffmpeg</b> (Mac: <code>brew install ffmpeg</code> · Windows: <code>winget install Gyan.FFmpeg</code>)')
  if (!t.whisper) faltan.push('<b>whisper-cli</b> para convertir el audio en texto (whisper.cpp)')
  else if (!t.whisperModel) faltan.push('el <b>modelo de Whisper</b> (<code>~/.whisper-models/ggml-medium.bin</code>)')

  root().innerHTML = `
  <div class="page">
    <div class="home-head">
      <div>${BRAND}<p class="dim tus">Tus proyectos</p></div>
      <button class="primary big" id="nuevo">+ Nuevo proyecto</button>
    </div>
    ${faltan.length ? `<div class="warn">Falta instalar: ${faltan.join(' · ')}. Pídele a Claude: “instala lo que falta”.</div>` : ''}
    ${st.proyectos.length ? `<div class="grid" id="grid">${tarjetas(st.proyectos)}</div>`
    : `<div class="empty"><p>Aún no tienes proyectos.</p><p class="dim">Crea el primero: le pones nombre, subes tus videos y listo.</p></div>`}
    <div class="dim small foot">Biblioteca: <code>${esc(st.biblioteca)}</code> · ${st.referencias.length} referencia${st.referencias.length === 1 ? '' : 's'} guardada${st.referencias.length === 1 ? '' : 's'}</div>
  </div>
  <div class="modal" id="modal" hidden>
    <form class="modal-box" id="form">
      <h2>Nuevo proyecto</h2>
      <label>Nombre del proyecto<input id="pn" type="text" placeholder="Ej: Video de objeciones" required autofocus /></label>
      <div class="row"><button type="button" id="cancel">Cancelar</button><button class="primary" type="submit">Crear</button></div>
    </form>
  </div>`

  const modal = document.getElementById('modal')!
  document.getElementById('nuevo')!.onclick = () => { modal.hidden = false; (document.getElementById('pn') as HTMLInputElement).focus() }
  document.getElementById('cancel')!.onclick = () => { modal.hidden = true }
  document.getElementById('form')!.addEventListener('submit', async e => {
    e.preventDefault()
    const name = (document.getElementById('pn') as HTMLInputElement).value
    try { const p = await api.crearProyecto(name); go(`#/p/${p.slug}`) } catch (err) { alert((err as Error).message) }
  })
  const bindCards = () => {
    root().querySelectorAll<HTMLElement>('.cardlink').forEach(c => { c.onclick = () => go(`#/p/${c.dataset.slug}`) })
    root().querySelectorAll<HTMLElement>('[data-delproj]').forEach(b => {
      b.onclick = async () => {
        const ok = await confirmar('Borrar proyecto', `Se borra el proyecto <b>${esc(b.dataset.nombre ?? '')}</b>: su edición, textos, transcripción y copias livianas. <b>Tus videos originales enlazados no se borran.</b> Si subiste copias dentro del proyecto, también se borran.`, 'Borrar proyecto')
        if (!ok) return
        await api.borrarProyecto(b.dataset.delproj!); await renderHome()
      }
    })
  }
  bindCards()
  // mientras haya vistas previas generándose, refresca las tarjetas (sin cortar un video que se está viendo)
  let last = st.proyectos
  const poll = async () => {
    if (!document.getElementById('grid') || (location.hash && location.hash !== '#/')) return
    try {
      const s2 = await api.estado()
      if (prevSig(s2.proyectos) !== prevSig(last)) { document.getElementById('grid')!.innerHTML = tarjetas(s2.proyectos); bindCards() }
      last = s2.proyectos
      if (s2.proyectos.some(p => p.preview && !p.preview.listo)) setTimeout(poll, 3000)
    } catch { setTimeout(poll, 5000) }
  }
  if (st.proyectos.some(p => p.preview && !p.preview.listo)) setTimeout(poll, 3000)
}

// ------------------------------------------------------------------------------------------------
// PROYECTO: material + referencias
// ------------------------------------------------------------------------------------------------
const icon = (s: string) => ({ pending: '○', running: '◐', done: '✓', error: '✕', skipped: '–' })[s] ?? '○'

function jobHtml(j: Trabajo) {
  return `<ul class="steps">${j.steps.map(s => `
    <li class="${s.state}"><span class="ic">${icon(s.state)}</span>
      <span>${esc(s.label)}${s.detail ? ` <span class="dim">· ${esc(s.detail)}</span>` : ''}</span>
      ${s.state === 'running' && s.pct !== undefined ? `<span class="bar"><i style="width:${Math.round(s.pct * 100)}%"></i></span>` : ''}
    </li>`).join('')}</ul>
    ${j.status === 'error' ? `<div class="warn">${esc(j.error ?? 'Error')}</div>` : ''}`
}

export async function renderProject(slug: string) {
  root().innerHTML = '<div class="page"><p class="dim">Cargando…</p></div>'
  let info: ProyectoInfo, refs: Referencia[]
  try { [info, refs] = await Promise.all([api.proyecto(slug), api.referencias()]) }
  catch (e) { root().innerHTML = `<div class="page"><button id="back">← Proyectos</button><div class="warn">${esc((e as Error).message)}</div></div>`; document.getElementById('back')!.onclick = () => go('#/'); return }

  const linked = new Set(info.referencias)

  root().innerHTML = `
  <div class="page">
    ${BRAND}
    <div class="proj-top">
      <button id="back">← Proyectos</button>
      <h1>${esc(info.name)}</h1>
      <span class="grow"></span>
      ${info.tieneEditor ? '<button class="primary" id="abrir">Abrir editor</button>' : ''}
    </div>

    <section>
      <h2><span class="num">1</span> Material <small class="dim">los videos que vas a editar</small></h2>
      <div class="drop" id="dropMat"><p>Arrastra aquí tus videos</p><p class="dim small">o</p><button class="primary" id="pickMat">Elegir archivos</button><p class="dim small">Se enlazan donde ya están: no se copian ni ocupan espacio extra.</p></div>
      <div class="tiles" id="matList">${tilesMat(info.material)}</div>
      <div id="upl"></div>
      <button class="primary big wide" id="recortar" ${info.material.length ? '' : 'disabled'}>Recorta silencios y errores</button>
      <p class="dim small">Convierte el audio en texto, quita los silencios y Claude quita lo repetido y ordena el guion para que se entienda.</p>
      <div id="job"></div>
    </section>

    <section>
      <h2><span class="num">2</span> Referencias <small class="dim">estilos que quieres copiar · se guardan para todos tus proyectos</small></h2>
      <div class="tiles" id="refList">${tilesRef(refs, linked)}</div>
      <div class="drop small" id="dropRef"><span>Arrastra referencias aquí o </span><button class="primary" id="pickRef">elegir archivos</button></div>
      <div id="uplRef"></div>
      <label class="reco"><span>¿Alguna recomendación para el video? <span class="dim">(opcional)</span></span>
        <textarea id="recomendacion" rows="3" placeholder="Ej: que sea corto, que empiece fuerte, tono más serio…"></textarea></label>
      <button class="primary big wide" id="completa" ${info.procesado && linked.size ? '' : 'disabled'}>Edición completa basada en referencias</button>
      <p class="dim small" id="completaInfo">${info.procesado ? 'Marca las referencias y Claude convierte tu video en lo que buscas, copiando su estilo.' : 'Disponible después de “Recorta silencios y errores”.'}</p>
    </section>


  </div>`

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  $('back').onclick = () => go('#/')
  if (info.tieneEditor) $('abrir').onclick = () => { location.hash = `#/editor/${slug}` }

  // --- agregar archivos: ENLAZAR (no copiar). Copiar solo si no se puede encontrar el original --------------------
  type Enlazar = (a: ArchivoInfo[]) => Promise<{ enlazados: string[]; noEncontrados: string[] }>
  async function copiarVarios(files: File[], url: string, box: HTMLElement) {
    box.innerHTML = files.map((f, i) => `<div class="up"><span>${esc(f.name)}</span><span class="bar"><i id="u${box.id}${i}" style="width:0%"></i></span></div>`).join('')
    for (const [i, f] of files.entries()) {
      try { await subir(url, f, p => { (document.getElementById(`u${box.id}${i}`) as HTMLElement).style.width = `${Math.round(p * 100)}%` }) }
      catch (e) { box.insertAdjacentHTML('beforeend', `<div class="warn">${esc(f.name)}: ${esc((e as Error).message)}</div>`); return }
    }
  }
  async function agregarArrastrados(files: FileList, box: HTMLElement, enlazar: Enlazar, urlCopia: string) {
    const vids = [...files].filter(f => VIDEO.test(f.name) || f.type.startsWith('video/'))
    if (!vids.length) { box.innerHTML = '<div class="warn">Esos archivos no parecen videos.</div>'; return }
    box.innerHTML = '<p class="dim small">Buscando los archivos originales…</p>'
    const r = await enlazar(vids.map(f => ({ name: f.name, size: f.size, lastModified: f.lastModified })))
    const faltan = vids.filter(f => r.noEncontrados.includes(f.name))
    if (faltan.length) {
      const total = faltan.reduce((s, f) => s + f.size, 0)
      const ok = await confirmar('No encuentro el original', `No pude encontrar en tu disco ${faltan.length === 1 ? 'el original de' : 'los originales de'} <b>${faltan.map(f => esc(f.name)).join(', ')}</b>. Habría que <b>copiarlo al proyecto</b> (ocupa ${fmtSize(total)} más). Si prefieres no duplicar, cancela y usa <b>Elegir archivos</b>.`, 'Copiar', false)
      if (ok) await copiarVarios(faltan, urlCopia, box)
    }
    await renderProject(slug)
  }
  async function elegir(fn: () => Promise<{ agregados: string[]; cancelado: boolean }>, btn: HTMLElement, box: HTMLElement) {
    const t = btn.textContent; btn.textContent = 'Elige en la ventana que se abrió…'; (btn as HTMLButtonElement).disabled = true
    try { await fn() } catch (e) { box.innerHTML = `<div class="warn">${esc((e as Error).message)}</div>`; btn.textContent = t; (btn as HTMLButtonElement).disabled = false; return }
    await renderProject(slug)
  }
  const wireDrop = (zone: HTMLElement, pick: HTMLElement, elegirFn: () => Promise<{ agregados: string[]; cancelado: boolean }>, enlazar: Enlazar, urlCopia: string, box: HTMLElement) => {
    pick.onclick = () => { void elegir(elegirFn, pick, box) }
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('over') }
    zone.ondragleave = () => zone.classList.remove('over')
    zone.ondrop = e => { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer?.files.length) void agregarArrastrados(e.dataTransfer.files, box, enlazar, urlCopia) }
  }
  wireDrop($('dropMat'), $('pickMat'), () => api.elegirMaterial(slug), a => api.enlazarMaterial(slug, a), `/api/proyectos/${slug}/material`, $('upl'))
  wireDrop($('dropRef'), $('pickRef'), () => api.elegirReferencias(slug), a => api.enlazarReferencias(a, slug), `/api/referencias?proyecto=${slug}`, $('uplRef'))

  // --- tarjetas: borrar, elegir referencias y refrescar miniaturas ---------------------------------------
  let cur = { info, refs }
  let pollTimer = 0
  function bindTiles() {
    root().querySelectorAll<HTMLElement>('[data-del]').forEach(b => {
      b.onclick = async () => {
        const n = esc(b.dataset.nombre ?? '')
        const ok = b.dataset.modo === 'enlace'
          ? await confirmar('Quitar del proyecto', `Se quita <b>${n}</b> de este proyecto. <b>Tu archivo original no se borra.</b>`, 'Quitar')
          : await confirmar('Borrar la copia', `Se borra la copia de <b>${n}</b> que está dentro del proyecto. Esto no se puede deshacer.`)
        if (!ok) return
        await api.borrarMaterial(slug, b.dataset.del!); await renderProject(slug)
      }
    })
    root().querySelectorAll<HTMLElement>('[data-delref]').forEach(b => {
      b.onclick = async () => {
        const n = esc(b.dataset.nombre ?? '')
        const ok = b.dataset.modo === 'enlace'
          ? await confirmar('Eliminar referencia', `Se elimina <b>${n}</b> de tu biblioteca y ya no aparece en ningún proyecto. <b>Tu archivo original no se borra.</b>`, 'Eliminar')
          : await confirmar('Eliminar referencia', `Se borra la copia de <b>${n}</b> de tu biblioteca y desaparece de todos los proyectos. Esto no se puede deshacer.`, 'Eliminar')
        if (!ok) return
        await api.borrarReferencia(b.dataset.delref!); await renderProject(slug)
      }
    })
    root().querySelectorAll<HTMLElement>('[data-ubicar]').forEach(b => { b.onclick = async () => { b.textContent = '…'; await api.ubicarMaterial(slug, b.dataset.ubicar!); await renderProject(slug) } })
    root().querySelectorAll<HTMLElement>('[data-ubicarref]').forEach(b => { b.onclick = async () => { b.textContent = '…'; await api.ubicarReferencia(b.dataset.ubicarref!); await renderProject(slug) } })
    root().querySelectorAll<HTMLInputElement>('[data-ref]').forEach(c => {
      c.onchange = async () => {
        const ids = [...root().querySelectorAll<HTMLInputElement>('[data-ref]:checked')].map(x => x.dataset.ref!)
        await api.setReferencias(slug, ids)
        c.closest('.tile')?.classList.toggle('sel', c.checked)
        ;($('completa') as HTMLButtonElement).disabled = !(cur.info.procesado && ids.length) || estadoCompleta === 'activa'
      }
    })
  }
  const pendientes = (i: ProyectoInfo, r: Referencia[]) => i.material.some(f => !f.preview.listo) || r.some(x => !x.preview.listo)
  async function poll() {
    if (!document.getElementById('matList') || location.hash !== `#/p/${slug}`) return
    try {
      const [i2, r2] = await Promise.all([api.proyecto(slug), api.referencias()])
      if (signature(i2, r2) !== signature(cur.info, cur.refs)) {   // solo redibuja si cambió algo (no corta un video en reproducción)
        const linked2 = new Set(i2.referencias)
        $('matList').innerHTML = tilesMat(i2.material); $('refList').innerHTML = tilesRef(r2, linked2); bindTiles()
      }
      cur = { info: i2, refs: r2 }
      if (pendientes(i2, r2)) pollTimer = window.setTimeout(poll, 2500)
    } catch { pollTimer = window.setTimeout(poll, 4000) }
  }
  bindTiles()
  if (pendientes(info, refs)) pollTimer = window.setTimeout(poll, 2500)
  void pollTimer

  // --- botón 1: recortar silencios y errores ---------------------------------------------------------------
  const jobBox = $('job')
  async function seguir(jobId: string) {
    ;($('recortar') as HTMLButtonElement).disabled = true
    for (;;) {
      const j = await api.trabajo(jobId)
      jobBox.innerHTML = jobHtml(j)
      if (j.status !== 'running') {
        if (j.status === 'done') await renderProject(slug)
        else ($('recortar') as HTMLButtonElement).disabled = false
        return
      }
      await new Promise(r => setTimeout(r, 700))
    }
  }
  $('recortar').onclick = async () => {
    try { const { jobId } = await api.procesar(slug); void seguir(jobId) } catch (e) { jobBox.innerHTML = `<div class="warn">${esc((e as Error).message)}</div>` }
  }

  // --- botón 2: edición completa (pedido a Claude + estado en vivo) -----------------------------------------------
  let estadoCompleta: 'libre' | 'activa' = 'libre'
  const infoEl = $('completaInfo')
  async function refrescarCompleta() {
    if (!document.getElementById('completa') || location.hash !== `#/p/${slug}`) return
    const sols = (await api.solicitudes(slug)).filter(x => x.tipo === 'completa')
    const x = sols[0]
    const btn = $('completa') as HTMLButtonElement
    if (x && (x.estado === 'pendiente' || x.estado === 'en_curso')) {
      estadoCompleta = 'activa'; btn.disabled = true
      infoEl.textContent = x.estado === 'pendiente' ? 'Enviado a Claude, esperando que empiece…' : 'Claude está editando…'
      setTimeout(refrescarCompleta, 1500)
    } else {
      estadoCompleta = 'libre'
      btn.disabled = !(cur.info.procesado && cur.info.referencias.length)
      if (x?.estado === 'hecho') infoEl.innerHTML = '✓ Listo. Pulsa <b>Abrir editor</b> para ver y corregir el resultado.'
      if (x?.estado === 'error') infoEl.textContent = 'Claude no pudo terminar: ' + (x.nota ?? 'error')
    }
  }
  $('completa').onclick = async () => {
    try { await api.pedirEdicionCompleta(slug, ($('recomendacion') as HTMLTextAreaElement).value.trim()); void refrescarCompleta() } catch (e) { infoEl.textContent = (e as Error).message }
  }
  void refrescarCompleta()

  // si había un trabajo en marcha (saliste y volviste), retoma el progreso
  void api.trabajoActivo(slug).then(j => { if (j) void seguir(j.id) })
}
