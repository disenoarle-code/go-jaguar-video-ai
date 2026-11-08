import { api } from './api'
import { ico } from './icons'

export type Fase = 1 | 2 | 3 | 4
const NOMBRES = ['Material', 'Guion', 'Propuesta', 'Editar']
const RUTA = (slug: string, f: Fase) => f === 1 ? `#/p/${slug}` : f === 2 ? `#/p/${slug}/guion` : f === 3 ? `#/p/${slug}/propuesta` : `#/p/${slug}/editando`

/**
 * Barra de fases (arriba en cada pantalla de creación): Material → Guion → Propuesta → Editar.
 * Se puede RETROCEDER a cualquier fase anterior mientras el video no esté en el editor. Avanzar: la fase ya alcanzada, o el botón "Siguiente"
 * ejecuta la acción principal de la pantalla (`avanzar`: guardar y pasar; en Propuesta, pedir "Editar").
 */
export async function renderFases(host: HTMLElement, slug: string, actual: Fase, avanzar?: () => void | Promise<void>, avanzarOk = true) {
  let hayGuion = false, hayPropuesta = false
  try { const f = await api.fase(slug); hayGuion = f.hayGuion; hayPropuesta = f.hayPropuesta } catch { /* sin datos: solo retroceder */ }
  const alcanzable = (f: Fase) => f < actual || (f === 2 && hayGuion) || (f === 3 && hayPropuesta)
  host.innerHTML = `<div class="fases">
    <button class="fase-flecha" id="f-ant" ${actual === 1 ? 'disabled' : ''} title="Fase anterior">${ico('arrow-left')} Anterior</button>
    <ol>${([1, 2, 3, 4] as Fase[]).map(f => `<li><button class="fase ${f === actual ? 'act' : f < actual || alcanzable(f) ? 'ok' : ''}" data-f="${f}" ${f === actual || (f !== 4 && !alcanzable(f)) || f === 4 ? 'disabled' : ''}><b>${f}</b> ${NOMBRES[f - 1]}</button></li>`).join('')}</ol>
    <button class="fase-flecha prim" id="f-sig" ${avanzar && avanzarOk ? '' : 'disabled'} title="${actual === 3 ? 'Empezar a editar' : 'Siguiente fase'}">${actual === 3 ? 'Editar' : 'Siguiente'} ${ico('arrow-right')}</button>
  </div>`
  host.querySelectorAll<HTMLElement>('[data-f]').forEach(b => { b.onclick = () => { location.hash = RUTA(slug, Number(b.dataset.f) as Fase) } })
  host.querySelector<HTMLElement>('#f-ant')!.onclick = () => { if (actual > 1) location.hash = RUTA(slug, (actual - 1) as Fase) }
  host.querySelector<HTMLElement>('#f-sig')!.onclick = () => { void avanzar?.() }
}
