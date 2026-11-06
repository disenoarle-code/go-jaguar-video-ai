/** Cliente de la API local (server/api.ts). */
export interface Herramientas { ffmpeg: boolean; ffprobe: boolean; whisper: boolean; whisperModel: boolean; hwaccel: string | null }
export interface Miniatura { poster: string | null; video: string | null; listo: boolean }
export interface ProyectoResumen { slug: string; name: string; createdAt: string; ultimaEdicion: string; procesado: boolean; tieneEditor: boolean; material: number; referencias: number; duracion: number; preview: (Miniatura & { tipo: 'edicion' | 'material' }) | null }
export type Modo = 'enlace' | 'copia'
export interface Referencia { id: string; nombre: string; size: number; agregada: string; modo: Modo; existe: boolean; ruta: string; perfilDeEstilo: boolean; preview: Miniatura }
export interface ArchivoInfo { name: string; size: number; lastModified: number }
export interface ProyectoInfo {
  name: string; slug: string; createdAt: string; idioma: string; referencias: string[]; procesado?: string
  material: { id: string; name: string; modo: Modo; existe: boolean; ruta: string; size: number; preview: Miniatura }[]; tieneEditor: boolean
}
export interface Paso { id: string; label: string; state: 'pending' | 'running' | 'done' | 'error' | 'skipped'; detail?: string; pct?: number }
export interface Solicitud { id: string; slug: string; tipo: 'errores' | 'completa'; estado: 'pendiente' | 'en_curso' | 'hecho' | 'error'; creado: string; nota?: string }
export interface Trabajo { id: string; status: 'running' | 'done' | 'error'; steps: Paso[]; error?: string }

async function j<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `Error ${r.status}`)
  return body as T
}
const post = (url: string, data?: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) })

export const api = {
  estado: () => fetch('/api/estado').then(j<{ biblioteca: string; herramientas: Herramientas; proyectos: ProyectoResumen[]; referencias: Referencia[] }>),
  crearProyecto: (name: string) => post('/api/proyectos', { name }).then(j<{ slug: string; name: string }>),
  proyecto: (slug: string) => fetch(`/api/proyectos/${slug}`).then(j<ProyectoInfo>),
  procesar: (slug: string) => post(`/api/proyectos/${slug}/procesar`).then(j<{ jobId: string }>),
  trabajo: (id: string) => fetch(`/api/trabajos/${encodeURIComponent(id)}`).then(j<Trabajo>),
  trabajoActivo: (slug: string) => fetch(`/api/proyectos/${slug}/trabajo`).then(j<Trabajo | null>),
  pedirEdicionCompleta: (slug: string, recomendacion: string) => post(`/api/proyectos/${slug}/pedir`, { tipo: 'completa', recomendacion }).then(j<Solicitud>),
  solicitudes: (slug: string) => fetch(`/api/proyectos/${slug}/solicitudes`).then(j<Solicitud[]>),
  referencias: () => fetch('/api/referencias').then(j<Referencia[]>),
  setReferencias: (slug: string, ids: string[]) => post(`/api/proyectos/${slug}/referencias`, { ids }, 'PUT').then(j<{ referencias: string[] }>),
  elegirMaterial: (slug: string) => post(`/api/proyectos/${slug}/material/elegir`).then(j<{ agregados: string[]; cancelado: boolean }>),
  enlazarMaterial: (slug: string, archivos: ArchivoInfo[]) => post(`/api/proyectos/${slug}/material/enlazar`, { archivos }).then(j<{ enlazados: string[]; noEncontrados: string[] }>),
  ubicarMaterial: (slug: string, id: string) => post(`/api/proyectos/${slug}/material/${encodeURIComponent(id)}/ubicar`).then(j<{ ok: boolean }>),
  elegirReferencias: (slug: string) => post(`/api/referencias/elegir?proyecto=${slug}`).then(j<{ agregados: string[]; cancelado: boolean }>),
  enlazarReferencias: (archivos: ArchivoInfo[], slug: string) => post(`/api/referencias/enlazar?proyecto=${slug}`, { archivos }).then(j<{ enlazados: string[]; noEncontrados: string[] }>),
  ubicarReferencia: (id: string) => post(`/api/referencias/${encodeURIComponent(id)}/ubicar`).then(j<{ ok: boolean }>),
  borrarProyecto: (slug: string) => fetch(`/api/proyectos/${slug}`, { method: 'DELETE' }).then(j<{ ok: boolean }>),
  borrarMaterial: (slug: string, name: string) => fetch(`/api/proyectos/${slug}/material/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(j<{ ok: boolean }>),
  borrarReferencia: (id: string) => fetch(`/api/referencias/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(j<{ ok: boolean }>),
}

/** Sube un archivo grande por streaming, con progreso (XHR). */
export function subir(url: string, file: File, onProgress: (p: number) => void): Promise<{ name?: string; id?: string }> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PUT', `${url}${url.includes('?') ? '&' : '?'}filename=${encodeURIComponent(file.name)}`)
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(JSON.parse(x.responseText || '{}').error ?? `Error ${x.status}`)))
    x.onerror = () => reject(new Error('No se pudo subir el archivo'))
    x.send(file)
  })
}

export const fmtSize = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
