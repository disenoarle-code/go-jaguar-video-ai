import { ico } from './icons'
import { api, type Guion, type Parrafo } from './api'
import { renderFases } from './fases'

const root = () => document.getElementById('shell')!
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const go = (h: string) => { location.hash = h }
const tc = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/** Pantalla de revisión de guion: párrafos con miniatura, reordenables, y palabras que se pueden quitar con un clic. */
export async function renderGuion(slug: string) {
  root().innerHTML = '<div class="page"><p class="dim">Cargando guion…</p></div>'
  let g: Guion
  try { g = await api.guion(slug) } catch (e) { root().innerHTML = `<div class="page"><div class="warn">${esc((e as Error).message)}</div></div>`; return }
  if (!g.parrafos.length) {
    root().innerHTML = `<div class="page"><a class="brand" href="#/"><img src="/logo.svg" alt="Go Jaguar" /><span>Video AI</span></a>
      <div class="warn">No hay texto para revisar. Procesa el material primero (hace falta whisper para convertir el audio en texto).</div>
      <button id="volver">${ico('arrow-left')} Volver al proyecto</button></div>`
    document.getElementById('volver')!.onclick = () => go(`#/p/${slug}`)
    return
  }
  let ps: Parrafo[] = g.parrafos
  let ultimo: [number, number] | null = null   // última palabra tocada (para quitar varias con Mayús)
  let timer = 0
  let tocado = false     // si cambia el guion después de haber pedido una propuesta, esa propuesta ya no sirve

  const guardar = () => { tocado = true; clearTimeout(timer); timer = window.setTimeout(() => { void api.guardarGuion(slug, ps).catch(() => {}) }, 500) }
  const quitadas = () => ps.reduce((s, p) => s + p.words.filter(w => w.del).length, 0)
  const total = () => ps.reduce((s, p) => s + p.words.length, 0)

  const bloque = (p: Parrafo, n: number) => {
    const vivo = p.words.some(w => !w.del)
    return `<div class="gp ${vivo ? '' : 'muerto'}" data-n="${n}">
      <div class="gp-mango" draggable="true" title="Arrastra para reordenar">⠿</div>
      <div class="gp-thumb"><img loading="lazy" src="/api/proyectos/${slug}/miniatura?f=${encodeURIComponent(p.f)}&t=${p.words[0].t0}" alt=""><span>${tc(p.words[0].t0)}</span></div>
      <div class="gp-txt">${p.words.map((w, k) => `<span class="gw ${w.del ? 'del' : ''} ${w.mul ? 'mul' : ''}" data-k="${k}">${esc(w.w)}</span>`).join(' ')}</div>
      <button class="trash" data-borrar="${n}" title="${vivo ? 'Quitar toda la sección' : 'Restaurar la sección'}">${ico(vivo ? 'trash' : 'check')}</button>
    </div>`
  }

  const pintar = () => {
    root().innerHTML = `
    <div class="page guion">
      <a class="brand" href="#/"><img src="/logo.svg" alt="Go Jaguar" /><span>Video AI</span></a>
      <div class="proj-top"><button id="back">${ico('arrow-left')} Proyecto</button><h1>Revisión del guion</h1></div>
      <div id="fases"></div>
      <p class="dim small">Cada sección es un tramo del video. Arrastra el asa <b>⠿</b> para subirla o bajarla; toca una palabra para quitarla o <b>arrastra sobre varias</b> para quitarlas juntas. Las <span class="gw mul del">muletillas</span> ya vienen quitadas: tócalas si quieres dejarlas. Todos los cortes llevan 30 ms de colchón para no comer palabras.</p>
      <div id="gl">${ps.map(bloque).join('')}</div>
      <div class="gbar"><span class="dim small" id="gstat"></span><span class="grow"></span><button class="primary big" id="siguiente">Siguiente paso ${ico('arrow-right')}</button></div>
    </div>`
    estado(); enlazar()
  }
  const estado = () => { const e = document.getElementById('gstat'); if (e) e.textContent = `${quitadas()} de ${total()} palabras quitadas · ${ps.length} secciones` }

  const enlazar = () => {
    const gl = document.getElementById('gl')!
    document.getElementById('back')!.onclick = () => go(`#/p/${slug}`)
    gl.onclick = e => {
      const t = e.target as HTMLElement
      const w = t.closest<HTMLElement>('.gw'), bor = t.closest<HTMLElement>('[data-borrar]')
      if (bor) {
        const p = ps[Number(bor.dataset.borrar)], vivo = p.words.some(x => !x.del)
        p.words.forEach(x => { x.del = vivo })
        guardar(); pintar(); return
      }
      if (!w || !e.shiftKey) return    // el clic simple y el arrastre se resuelven en mouseup
      const n = Number(w.closest<HTMLElement>('.gp')!.dataset.n), k = Number(w.dataset.k)
      if (!ultimo) { aplicarRango(n, k, k); return }
      // Mayús+clic: todo lo que hay entre la última palabra tocada y esta (puede cruzar secciones), con el mismo efecto que tuvo la última
      const [n0, k0] = ultimo
      const [ini, fin] = n0 < n || (n0 === n && k0 <= k) ? [[n0, k0], [n, k]] : [[n, k], [n0, k0]]
      const quitar = !!ps[n0].words[k0].del
      for (let q = ini[0]; q <= fin[0]; q++) {
        const ws = ps[q].words
        for (let i = q === ini[0] ? ini[1] : 0; i <= (q === fin[0] ? fin[1] : ws.length - 1); i++) ws[i].del = quitar
        const bl = gl.querySelector<HTMLElement>(`.gp[data-n="${q}"]`)!; const tmp = document.createElement('div'); tmp.innerHTML = bloque(ps[q], q); bl.replaceWith(tmp.firstElementChild!)
      }
      ultimo = [n, k]; guardar(); estado()
    }
    // seleccionar varias palabras arrastrando (o una con un clic): todas se quitan / restauran a la vez
    let sel: { n: number; a: number; b: number } | null = null
    const pintarSel = () => gl.querySelectorAll<HTMLElement>('.gw').forEach(x => {
      const dentro = !!sel && Number(x.closest<HTMLElement>('.gp')!.dataset.n) === sel.n && Number(x.dataset.k) >= Math.min(sel.a, sel.b) && Number(x.dataset.k) <= Math.max(sel.a, sel.b)
      x.classList.toggle('sel', dentro)
    })
    gl.onmousedown = e => {
      const w = (e.target as HTMLElement).closest<HTMLElement>('.gw'); if (!w || e.shiftKey || e.button !== 0) return
      sel = { n: Number(w.closest<HTMLElement>('.gp')!.dataset.n), a: Number(w.dataset.k), b: Number(w.dataset.k) }
      pintarSel(); e.preventDefault()
    }
    gl.onmouseover = e => {
      if (!sel) return
      const w = (e.target as HTMLElement).closest<HTMLElement>('.gw')
      if (w && Number(w.closest<HTMLElement>('.gp')!.dataset.n) === sel.n) { sel.b = Number(w.dataset.k); pintarSel() }
    }
    window.onmouseup = () => {
      if (!sel) return
      const s = sel; sel = null
      aplicarRango(s.n, s.a, s.b)
    }
    const aplicarRango = (n: number, a: number, b: number) => {
      const p = ps[n], lo = Math.min(a, b), hi = Math.max(a, b)
      const quitar = !p.words[a].del     // si la primera ya estaba quitada, el gesto restaura
      for (let i = lo; i <= hi; i++) p.words[i].del = quitar
      ultimo = [n, b]
      guardar()
      const bl = gl.querySelector<HTMLElement>(`.gp[data-n="${n}"]`)!; const tmp = document.createElement('div'); tmp.innerHTML = bloque(p, n); bl.replaceWith(tmp.firstElementChild!)
      estado()
    }
    // arrastrar y soltar para reordenar
    let desde = -1
    gl.ondragstart = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.gp'); if (!b) return; desde = Number(b.dataset.n); b.classList.add('arrastrando'); e.dataTransfer!.effectAllowed = 'move'; e.dataTransfer!.setData('text/plain', String(desde)); e.dataTransfer!.setDragImage(b, 20, 20) }
    gl.ondragend = () => { gl.querySelectorAll('.arrastrando,.sobre').forEach(x => x.classList.remove('arrastrando', 'sobre')); desde = -1 }
    gl.ondragover = e => { if (desde < 0) return; e.preventDefault(); gl.querySelectorAll('.sobre').forEach(x => x.classList.remove('sobre')); (e.target as HTMLElement).closest('.gp')?.classList.add('sobre') }
    gl.ondrop = e => {
      if (desde < 0) return; e.preventDefault()
      const b = (e.target as HTMLElement).closest<HTMLElement>('.gp'); if (!b) return
      const a = Number(b.dataset.n); if (a === desde) return
      const [mov] = ps.splice(desde, 1); ps.splice(a, 0, mov)
      guardar(); pintar()
    }
    const avanzar = async () => {
      const btn = document.getElementById('siguiente') as HTMLButtonElement
      btn.disabled = true; btn.textContent = 'Un momento…'
      try {
        clearTimeout(timer); await api.guardarGuion(slug, ps)
        const f = await api.fase(slug)
        if (!f.hayPropuesta || tocado) await api.pedirPropuesta(slug)     // propuesta nueva solo si no hay o si cambiaste el guion
        go(`#/p/${slug}/propuesta`)
      } catch (err) { btn.disabled = false; btn.innerHTML = `Siguiente paso ${ico('arrow-right')}`; alert((err as Error).message) }
    }
    document.getElementById('siguiente')!.onclick = () => { void avanzar() }
    void renderFases(document.getElementById('fases')!, slug, 2, avanzar)
  }
  pintar()
}

