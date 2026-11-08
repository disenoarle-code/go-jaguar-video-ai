/** Cliente de la API local (server/api.ts). */
export interface Herramientas { ffmpeg: boolean; ffprobe: boolean; whisper: boolean; whisperModel: boolean; hwaccel: string | null }
export interface Miniatura { poster: string | null; video: string | null; audio: string | null; listo: boolean }
export type Etapa = 'creacion' | 'editando' | 'editor'
export interface PasoEdicion { id: string; label: string; estado: 'pendiente' | 'en_curso' | 'hecho' | 'omitido'; detalle?: string }
export type Rol = 'principal' | 'apoyo' | 'camara'
export type Tipo = 'video' | 'audio' | 'imagen'
export interface Ritmo { bpm: number; bpmAlt: number | null; confianza: number; duracion: number }
export interface ProyectoResumen { slug: string; name: string; createdAt: string; ultimaEdicion: string; procesado: boolean; tieneEditor: boolean; guionPendiente?: boolean; material: number; referencias: number; duracion: number; preview: (Miniatura & { tipo: 'edicion' | 'material' }) | null }
export type Modo = 'enlace' | 'copia'
export interface Referencia { id: string; nombre: string; size: number; agregada: string; modo: Modo; existe: boolean; ruta: string; perfilDeEstilo: boolean; preview: Miniatura; usos: number; ultimoUso: string | null; puntaje: number; nueva: boolean }
export interface ArchivoInfo { name: string; size: number; lastModified: number }
export interface ProyectoInfo {
  name: string; slug: string; createdAt: string; idioma: string; referencias: string[]; procesado?: string
  material: { id: string; rol: Rol; analizado?: boolean; tipo: Tipo; ritmo: Ritmo | null; name: string; modo: Modo; existe: boolean; ruta: string; size: number; preview: Miniatura }[]; tieneEditor: boolean; guionPendiente?: boolean; etapa?: Etapa; notas?: string
}
export interface Palabra { i: number; t0: number; t1: number; w: string; del?: boolean; mul?: boolean }
export interface Parrafo { id: string; f: string; words: Palabra[] }
export interface Guion { estado: 'revision'; parrafos: Parrafo[] }
export interface Opcion { tipo: 'toma_apoyo' | 'imagen' | 'animacion_2d' | 'animacion_3d' | 'video_generado'; descripcion: string; apoyo?: { toma: string; t0?: number; t1?: number } | null; busqueda?: string | null }
export interface Zona { id: string; f: string; t0: number; t1: number; texto: string; motivo: string; opciones: Opcion[]; elegida: number; prompt: string; aportes: string[]; decision: 'pendiente' | 'aceptada' | 'descartada' }
export interface Propuesta { estado: string; zonas: Zona[] }
export interface ApoyoInfo { stem: string; nombre: string; descripcion: string | null; hoja?: string | null; frames: { t: number; url: string }[] }
export interface Paso { id: string; label: string; state: 'pending' | 'running' | 'done' | 'error' | 'skipped'; detail?: string; pct?: number }
export interface Solicitud { id: string; slug: string; tipo: 'propuesta' | 'edicion' | 'aprendizaje'; estado: 'pendiente' | 'en_curso' | 'hecho' | 'error' | 'cancelado'; creado: string; nota?: string }
export interface Trabajo { id: string; status: 'running' | 'done' | 'error' | 'cancelado'; steps: Paso[]; error?: string }

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
  /** modo 'recorte' (opción 1: solo recorta) o 'completa' (opción 2: prepara el material y pide la edición completa en un solo paso). */
  procesar: (slug: string) => post(`/api/proyectos/${slug}/procesar`).then(j<{ jobId?: string; solicitud?: Solicitud }>),
  guion: (slug: string) => fetch(`/api/proyectos/${slug}/guion`).then(j<Guion>),
  guardarGuion: (slug: string, parrafos: Parrafo[]) => post(`/api/proyectos/${slug}/guion`, { parrafos }, 'PUT').then(j<{ ok: boolean }>),
  propuesta: (slug: string) => fetch(`/api/proyectos/${slug}/propuesta`).then(j<{ propuesta: Propuesta | null; solicitud: Solicitud | null; apoyos: ApoyoInfo[]; notas: string }>),
  pedirPropuesta: (slug: string) => post(`/api/proyectos/${slug}/propuesta`).then(j<Solicitud>),
  guardarPropuesta: (slug: string, zonas: Zona[]) => post(`/api/proyectos/${slug}/propuesta`, { zonas }, 'PUT').then(j<{ ok: boolean }>),
  guardarNotas: (slug: string, texto: string) => post(`/api/proyectos/${slug}/notas-edicion`, { texto }, 'PUT').then(j<{ ok: boolean }>),
  verificacion: (slug: string, para: 'editar' | 'editor') => fetch(`/api/proyectos/${slug}/verificacion?para=${para}`).then(j<{ ok: boolean; problemas: { tipo: string; mensaje: string; id?: string; reparable?: boolean }[]; avisos: string[] }>),
  reparar: (slug: string) => post(`/api/proyectos/${slug}/reparar`).then(j<{ regenerados: number }>),
  fase: (slug: string) => fetch(`/api/proyectos/${slug}/fase`).then(j<{ etapa: Etapa; hayGuion: boolean; hayPropuesta: boolean }>),
  editar: (slug: string) => post(`/api/proyectos/${slug}/editar`).then(j<Solicitud>),
  estadoEdicion: (slug: string) => fetch(`/api/proyectos/${slug}/editar`).then(j<{ etapa: Etapa; solicitud: Solicitud | null; pasos: PasoEdicion[] }>),
  cancelarEdicion: (slug: string) => post(`/api/proyectos/${slug}/editar/cancelar`).then(j<{ ok: boolean }>),
  trabajo: (id: string) => fetch(`/api/trabajos/${encodeURIComponent(id)}`).then(j<Trabajo>),
  cancelarTrabajo: (id: string) => post(`/api/trabajos/${encodeURIComponent(id)}/cancelar`).then(j<{ ok: boolean }>),
  cancelarSolicitud: (id: string) => post(`/api/solicitudes/${encodeURIComponent(id)}/cancelar`).then(j<{ ok: boolean }>),
  trabajoActivo: (slug: string) => fetch(`/api/proyectos/${slug}/trabajo`).then(j<Trabajo | null>),
  solicitudes: (slug: string) => fetch(`/api/proyectos/${slug}/solicitudes`).then(j<Solicitud[]>),
  referencias: () => fetch('/api/referencias').then(j<Referencia[]>),
  setReferencias: (slug: string, ids: string[]) => post(`/api/proyectos/${slug}/referencias`, { ids }, 'PUT').then(j<{ referencias: string[] }>),
  elegirMaterial: (slug: string, rol: Rol = 'principal') => post(`/api/proyectos/${slug}/material/elegir?rol=${rol}`).then(j<{ agregados: string[]; cancelado: boolean }>),
  enlazarMaterial: (slug: string, archivos: ArchivoInfo[], rol: Rol = 'principal') => post(`/api/proyectos/${slug}/material/enlazar?rol=${rol}`, { archivos }).then(j<{ enlazados: string[]; noEncontrados: string[] }>),
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
