import { api, type PasoEdicion } from './api'
import { esc } from './ui'

const BRAND = '<a class="brand" href="#/"><img src="/logo.svg" alt="Go Jaguar" /><span>Video AI</span></a>'
const ICO: Record<string, string> = { pendiente: '○', en_curso: '<span class="spin">◌</span>', hecho: '✓', omitido: '–' }

/** Pantalla de carga de la edición: explica paso a paso lo que hace Claude y, al terminar, abre el editor (sin vuelta atrás). */
export async function renderEditando(slug: string) {
  document.getElementById('shell')!.innerHTML = `<div class="page">${BRAND}<h1>Editando tu video</h1><div id="ed-body"><p class="dim">Cargando…</p></div></div>`
  const body = () => document.getElementById('ed-body')
  const vuelta = async () => {
    if (location.hash !== `#/p/${slug}/editando` || !body()) return
    let d: Awaited<ReturnType<typeof api.estadoEdicion>>
    try { d = await api.estadoEdicion(slug) } catch (e) { body()!.innerHTML = `<div class="warn">${esc((e as Error).message)}</div>`; return }
    if (d.etapa === 'editor') { location.hash = `#/editor/${slug}`; return }
    if (d.etapa === 'creacion') { location.hash = `#/p/${slug}/propuesta`; return }
    const sol = d.solicitud
    const fallo = sol && (sol.estado === 'error' || sol.estado === 'cancelado')
    const espera = sol ? Date.now() - new Date(sol.creado).getTime() : 0
    const aviso = fallo ? `Claude no pudo terminar: ${sol!.nota ?? sol!.estado}`
      : sol?.estado === 'pendiente' ? (espera > 20000 ? 'Claude no ha respondido todavía. ¿Está abierta la sesión de Claude Code en esta carpeta (con “npm run vigilar” corriendo)?' : 'Enviado a Claude, esperando que empiece…')
      : 'Claude está editando. Esto puede tardar unos minutos; no cierres la ventana.'
    const paso = (p: PasoEdicion) => `<li class="${p.estado === 'en_curso' ? 'running' : p.estado === 'hecho' ? 'done' : ''}"><span class="ic">${ICO[p.estado]}</span><span>${esc(p.label)}${p.detalle ? ` <span class="dim">· ${esc(p.detalle)}</span>` : ''}</span></li>`
    body()!.innerHTML = `<p class="${fallo ? 'warn' : 'dim'}">${esc(aviso)}</p><ul class="steps">${d.pasos.map(paso).join('')}</ul>
      <div class="row"><button id="ed-cancel">Cancelar y volver a la propuesta</button>${fallo ? '<button class="primary" id="ed-reintentar">Reintentar</button>' : ''}</div>`
    document.getElementById('ed-cancel')!.onclick = async () => { await api.cancelarEdicion(slug).catch(() => {}); location.hash = `#/p/${slug}/propuesta` }
    const r = document.getElementById('ed-reintentar'); if (r) r.onclick = async () => { await api.editar(slug).catch(() => {}); void vuelta() }
    setTimeout(vuelta, 1200)
  }
  void vuelta()
}
