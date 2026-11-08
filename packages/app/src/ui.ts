export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Confirmación dentro de la página (el confirm() del navegador no aparece en algunos visores y cancela solo). */
export function confirmar(titulo: string, textoHtml: string, ok = 'Borrar', peligro = true): Promise<boolean> {
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


export interface ProblemaUI { tipo: string; mensaje: string; id?: string; reparable?: boolean }
/** Lista de problemas con mensaje claro y, si algo se puede regenerar, el botón "Reparar". Devuelve true si el usuario reparó (conviene reintentar). */
export function mostrarProblemas(titulo: string, problemas: ProblemaUI[], reparar?: () => Promise<unknown>): Promise<boolean> {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal'
    const rep = !!reparar && problemas.some(p => p.reparable)
    m.innerHTML = `<div class="modal-box"><h2>${esc(titulo)}</h2><ul class="problemas">${problemas.map(p => `<li>${esc(p.mensaje)}</li>`).join('')}</ul>
      <div class="row"><button id="p-cerrar">Cerrar</button>${rep ? '<button class="primary" id="p-rep">Reparar</button>' : ''}</div></div>`
    document.body.appendChild(m)
    const fin = (v: boolean) => { m.remove(); resolve(v) }
    m.querySelector<HTMLElement>('#p-cerrar')!.onclick = () => fin(false)
    const b = m.querySelector<HTMLButtonElement>('#p-rep')
    if (b) b.onclick = async () => { b.disabled = true; b.textContent = 'Reparando…'; try { await reparar!() } catch { /* se reintenta la verificación */ } fin(true) }
  })
}
