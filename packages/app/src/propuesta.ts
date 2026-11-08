import { ico } from './icons'
import { confirmar, mostrarProblemas } from './ui'
import { renderFases } from './fases'
import { api, type ApoyoInfo, type Propuesta, type Zona } from './api'

const root = () => document.getElementById('shell')!
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const go = (h: string) => { location.hash = h }
const tc = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const TIPO: Record<string, string> = { toma_apoyo: 'Toma de apoyo', imagen: 'Imagen', animacion_2d: 'Animación 2D', animacion_3d: 'Animación 3D', video_generado: 'Video generado' }
const notasHtml = (t: string) => `<label class="reco"><span><b>Recomendaciones generales para la edición</b> <span class="dim">(opcional · estilo, ritmo, tono, qué evitar… lo leo antes de proponer y de editar)</span></span>
  <textarea id="notas" rows="3" placeholder="Ej: que se sienta muy dinámico, colores fríos, no usar música fuerte en la primera parte…">${esc(t)}</textarea></label>`
function bindNotas(slug: string) {
  const el = document.getElementById('notas') as HTMLTextAreaElement | null; if (!el) return
  let t = 0; el.oninput = () => { clearTimeout(t); t = window.setTimeout(() => { void api.guardarNotas(slug, el.value).catch(() => {}) }, 600) }
}
/** Qué le pido al usuario, dicho sin rodeos. */
function queHago(o: { tipo: string; apoyo?: unknown; busqueda?: string | null }) {
  if (o.apoyo) return { cls: 'ya', txt: 'Voy a usar una toma que ya subiste:' }
  if (o.tipo === 'animacion_2d' || o.tipo === 'animacion_3d') return { cls: 'yo', txt: 'Yo la creo, no tienes que subir nada:' }
  if (o.tipo === 'video_generado') return { cls: 'yo', txt: 'Se generaría con una herramienta de video (próximamente):' }
  return { cls: 'tu', txt: `Sugiero que subas ${o.tipo === 'imagen' ? 'una imagen' : 'una toma de apoyo'}:` }
}
/** Botón final: arma el video y empieza la edición. Después NO se puede volver a estas fases. */
async function editar(slug: string) {
  // verificación previa: no se empieza a editar con archivos o datos faltantes
  for (let intento = 0; intento < 3; intento++) {
    let v: Awaited<ReturnType<typeof api.verificacion>>
    try { v = await api.verificacion(slug, 'editar') } catch (e) { alert((e as Error).message); return }
    if (v.ok) break
    const reparo = await mostrarProblemas('Antes de editar hay que arreglar esto', v.problemas, () => api.reparar(slug))
    if (!reparo) return
  }
  const ok = await confirmar('¿Empezar a editar?', 'Claude armará el video con tu guion y tus tomas aceptadas y lo dejará en el editor. <b>Una vez en el editor ya no se puede volver a estas pantallas</b>: los cambios grandes se piden por el chat o se hacen a mano en el editor.', 'Editar', false)
  if (!ok) return
  try { await api.editar(slug); location.hash = `#/p/${slug}/editando` } catch (e) { alert((e as Error).message) }
}
const BRAND = '<a class="brand" href="#/"><img src="/logo.svg" alt="Go Jaguar" /><span>Video AI</span></a>'

/** Paso 2: propuesta de edición para las zonas relevantes (la escribe Claude). Por zona: sugerencia, tomas propias y un prompt libre. */
export async function renderPropuesta(slug: string) {
  root().innerHTML = `<div class="page">${BRAND}<p class="dim">Cargando…</p></div>`
  let d: Awaited<ReturnType<typeof api.propuesta>>
  try { d = await api.propuesta(slug) } catch (e) { root().innerHTML = `<div class="page">${BRAND}<div class="warn">${esc((e as Error).message)}</div></div>`; return }

  const activa = d.solicitud && (d.solicitud.estado === 'pendiente' || d.solicitud.estado === 'en_curso')
  if (!d.propuesta) return esperando(slug, d.solicitud, !!activa, d.notas)

  let zonas: Zona[] = d.propuesta.zonas
  let timer = 0
  const guardar = () => { clearTimeout(timer); timer = window.setTimeout(() => { void api.guardarPropuesta(slug, zonas).catch(() => {}) }, 500) }
  const apoyoDe = (stem?: string): ApoyoInfo | undefined => d.apoyos.find(a => a.stem === stem)

  const tarjeta = (z: Zona, n: number) => {
    const o = z.opciones[z.elegida] ?? z.opciones[0]
    const ap = o?.apoyo ? apoyoDe(o.apoyo.toma) : undefined
    return `<div class="zn ${z.decision}" data-n="${n}">
      <div class="zn-top">
        <div class="gp-thumb"><img loading="lazy" src="/api/proyectos/${slug}/miniatura?f=${encodeURIComponent(z.f)}&t=${z.t0}" alt=""><span>${tc(z.t0)}</span></div>
        <div class="zn-txt"><p class="zn-q">“${esc(z.texto)}”</p><p class="dim small">${esc(z.motivo)}</p></div>
      </div>
      ${o ? `<div class="zn-sug ${queHago(o).cls}"><p class="zn-que"><b>${queHago(o).txt}</b> <span class="chip">${esc(TIPO[o.tipo] ?? o.tipo)}</span></p><p>${esc(o.descripcion)}</p>
        ${ap?.hoja ? `<div class="zn-fr"><img class="zn-hoja" src="/${ap.hoja}" alt="" loading="lazy"><span class="dim small">${esc(ap.nombre)}</span></div>` : ''}
        ${ap && !ap.hoja ? `<div class="zn-fr">${ap.frames.slice(0, 5).map(f => `<img src="/${f.url}" alt="" loading="lazy">`).join('')}<span class="dim small">${esc(ap.nombre)}</span></div>` : ''}
        ${o.busqueda ? `<p class="zn-pide">${ico('arrow-right')} Qué debe mostrar: <b>${esc(o.busqueda)}</b></p>` : ''}</div>` : ''}
      <div class="zn-aportes">${z.aportes.map(a => `<span class="chip">${ico('check')} ${esc(a)}</span>`).join('')}<button class="${o && queHago(o).cls === 'tu' && !z.aportes.length ? 'primary ' : ''}mini" data-aporte="${n}">+ Subir mi toma o imagen para esta zona</button></div>
      <textarea rows="2" data-prompt="${n}" placeholder="¿Quieres algo diferente? Escribe aquí tu idea o prompt (opcional)">${esc(z.prompt)}</textarea>
      <div class="row"><button data-dec="${n}:descartada" class="${z.decision === 'descartada' ? 'danger' : ''}">No usar</button><button data-dec="${n}:aceptada" class="${z.decision === 'aceptada' ? 'primary' : ''}">${z.decision === 'aceptada' ? `${ico('check')} Aceptada` : 'Aceptar sugerencia'}</button></div>
    </div>`
  }

  const pintar = () => {
    root().innerHTML = `<div class="page guion">${BRAND}
      <div class="proj-top"><button id="back">${ico('arrow-left')} Guion</button><h1>Propuesta de edición</h1></div>
      <div id="fases"></div>
      <p class="dim small">Solo las secciones donde de verdad entra <b>otra toma</b> (de apoyo, imagen o video) o una <b>animación 2D/3D</b> para explicar algo complejo. Los textos, subtítulos y letras los decido yo según el estilo gráfico.</p>
      ${notasHtml(d.notas)}
      <div id="zl">${zonas.map(tarjeta).join('') || '<p class="dim">Claude no encontró zonas que ilustrar.</p>'}</div>
      <div class="gbar"><span class="dim small">${zonas.filter(z => z.decision === 'aceptada').length} aceptadas de ${zonas.length}</span><span class="grow"></span><button id="otra">Pedir otra propuesta</button><button class="primary big" id="editor">Editar ${ico('arrow-right')}</button></div></div>`
    const zl = document.getElementById('zl')!
    bindNotas(slug)
    document.getElementById('back')!.onclick = () => go(`#/p/${slug}/guion`)
    document.getElementById('editor')!.onclick = () => { void editar(slug) }
    void renderFases(document.getElementById('fases')!, slug, 3, () => editar(slug))
    document.getElementById('otra')!.onclick = async () => { await api.pedirPropuesta(slug); await renderPropuesta(slug) }
    zl.oninput = e => { const t = e.target as HTMLTextAreaElement; if (t.dataset.prompt) { zonas[Number(t.dataset.prompt)].prompt = t.value; guardar() } }
    zl.onclick = async e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-dec],[data-aporte]'); if (!b) return
      if (b.dataset.dec) {
        const [n, dec] = b.dataset.dec.split(':'); const z = zonas[Number(n)]
        z.decision = z.decision === dec ? 'pendiente' : (dec as Zona['decision']); guardar(); pintar(); return
      }
      const z = zonas[Number(b.dataset.aporte)]
      b.textContent = 'Elige en la ventana que se abrió…'
      try { const r = await api.elegirMaterial(slug, 'apoyo'); z.aportes.push(...r.agregados); guardar() } catch (err) { alert((err as Error).message) }
      pintar()
    }
  }
  pintar()
}

function esperando(slug: string, sol: Awaited<ReturnType<typeof api.propuesta>>['solicitud'], activa: boolean, notas: string) {
  const texto = !sol ? 'Aún no hay propuesta.' : sol.estado === 'en_curso' ? 'Claude está analizando las zonas importantes…'
    : sol.estado === 'pendiente' ? (Date.now() - new Date(sol.creado).getTime() > 20000 ? 'Claude no ha respondido todavía. ¿Está abierta la sesión de Claude Code en esta carpeta?' : 'Enviado a Claude, esperando que empiece…')
    : sol.estado === 'error' ? `Claude no pudo terminar: ${sol.nota ?? 'error'}` : sol.estado === 'cancelado' ? 'Cancelado.' : 'Preparando la propuesta…'
  root().innerHTML = `<div class="page">${BRAND}<div class="proj-top"><button id="back">${ico('arrow-left')} Guion</button><h1>Propuesta de edición</h1></div>
    <div id="fases"></div>
    <p>${esc(texto)}</p>
    ${notasHtml(notas)}
    <div class="row">${activa ? '<button id="cancelar">Cancelar</button>' : '<button class="primary" id="pedir">Pedir propuesta a Claude</button>'}${activa ? '' : '<button id="editor">Editar sin propuesta</button>'}</div></div>`
  bindNotas(slug)
  document.getElementById('back')!.onclick = () => go(`#/p/${slug}/guion`)
  const ed = document.getElementById('editor'); if (ed) ed.onclick = () => { void editar(slug) }
  void renderFases(document.getElementById('fases')!, slug, 3, activa ? undefined : () => editar(slug))
  const pedir = document.getElementById('pedir'); if (pedir) pedir.onclick = async () => { await api.pedirPropuesta(slug); await renderPropuesta(slug) }
  const canc = document.getElementById('cancelar'); if (canc) canc.onclick = async () => { await api.cancelarSolicitud(sol!.id); await renderPropuesta(slug) }
  // consulta sin repintar (para no borrar lo que el usuario escribe); repinta solo si cambió el estado o ya hay propuesta
  const vigila = () => setTimeout(async () => {
    if (location.hash !== `#/p/${slug}/propuesta`) return
    try { const n = await api.propuesta(slug); if (n.propuesta || n.solicitud?.estado !== sol?.estado) return void renderPropuesta(slug) } catch { /* reintenta */ }
    vigila()
  }, 2000)
  if (activa || (sol && sol.estado === 'hecho')) vigila()
}

export type { Propuesta }
