import './style.css'
import { bootEditor } from './editor'
import { applyIcons } from './icons'
import { renderHome, renderProject } from './views'
import { bootRender } from './render'

void document.fonts?.load('400 14px Figtree'); void document.fonts?.load('700 14px Figtree')
const isEditor = (h: string) => h.startsWith('#/editor/')
const renderMatch = /^#\/render\/([a-z0-9-]+)\?w=(\d+)&h=(\d+)/.exec(location.hash)   // página interna de la exportación (Chromium sin pantalla)
const modeAtLoad = isEditor(location.hash)

function route() {
  const h = location.hash || '#/'
  const shell = document.getElementById('shell')!, app = document.getElementById('app')!
  if (isEditor(h)) {
    shell.hidden = true; app.hidden = false
    void bootEditor(h.slice('#/editor/'.length)).catch(e => { console.error(e); document.getElementById('loading')!.textContent = 'Error: ' + (e?.message ?? e) })
  } else {
    app.hidden = true; shell.hidden = false
    const m = /^#\/p\/([a-z0-9-]+)$/.exec(h)
    void (m ? renderProject(m[1]) : renderHome())
  }
}

// Entrar o salir del editor recarga la página (limpia listeners y el motor de video).
window.addEventListener('hashchange', () => { if (renderMatch) return; if (isEditor(location.hash) || modeAtLoad) location.reload(); else route() })
if (renderMatch) void bootRender(renderMatch[1], Number(renderMatch[2]), Number(renderMatch[3]))
else { applyIcons(); route() }
