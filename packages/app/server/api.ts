/**
 * API local del editor (corre dentro del servidor de desarrollo de Vite).
 * Maneja la biblioteca en disco: proyectos, material, referencias, procesamiento y tareas para Claude.
 *
 * biblioteca/
 *   proyectos/<slug>/ { proyecto.json, proyecto.gojaguar, material/, proxies/, transcripciones/, analisis/, salidas/ }
 *   referencias/      { <archivo>, <archivo>.json, <nombre>.estilo.json }   ← compartidas por todos los proyectos
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { AsyncLocalStorage } from 'node:async_hooks'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { analizarRitmo, type Ritmo } from './ritmo'
import { activeExport, cancelExport, getExport, startExport, type ExportOpts } from './exportar'
import { fileURLToPath } from 'node:url'
import { Store, createProject, exec, execBatch, serialize, type AssetInfo, type Cmd } from '@gojaguar/core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(process.env.GOJAGUAR_BIBLIOTECA ?? path.join(HERE, '../../../biblioteca'))
const PROJ = path.join(ROOT, 'proyectos')
const SOL = path.join(ROOT, 'solicitudes')
const REFS = path.join(ROOT, 'referencias')
const MODEL = process.env.GOJAGUAR_WHISPER_MODEL ?? path.join(os.homedir(), '.whisper-models', 'ggml-medium.bin')
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.aiff', '.aif'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif', '.bmp', '.tif', '.tiff'])
type Tipo = 'video' | 'audio' | 'imagen'
const tipoDe = (n: string): Tipo | null => { const e = path.extname(n).toLowerCase(); return VIDEO_EXT.has(e) ? 'video' : AUDIO_EXT.has(e) ? 'audio' : IMAGE_EXT.has(e) ? 'imagen' : null }
const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.png': 'image/png' }

// --- utilidades ------------------------------------------------------------------------
const exists = (p: string) => fsp.access(p).then(() => true, () => false)
const readJson = async <T,>(p: string, fallback: T): Promise<T> => { try { return JSON.parse(await fsp.readFile(p, 'utf8')) as T } catch { return fallback } }
const writeJson = (p: string, v: unknown) => fsp.writeFile(p, JSON.stringify(v, null, 2))
const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body))
}
const readBody = async (req: IncomingMessage) => { const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer); return Buffer.concat(c).toString('utf8') }
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proyecto'
const safeName = (s: string) => path.basename(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180) || 'archivo'
const isSlug = (s: string) => /^[a-z0-9][a-z0-9-]*$/.test(s)

async function uniqueName(dir: string, name: string) {
  const ext = path.extname(name), stem = path.basename(name, ext)
  let n = name, i = 2
  while (await exists(path.join(dir, n))) n = `${stem} (${i++})${ext}`
  return n
}

/** El trabajo en curso: lo que se ejecute dentro queda registrado para poder cancelarlo. */
const jobCtx = new AsyncLocalStorage<Job>()
const procsDe = new Map<string, Set<ChildProcess>>()

function run(cmd: string, args: string[], onOut?: (chunk: string) => void): Promise<{ code: number; out: string; err: string }> {
  return new Promise(resolve => {
    const job = jobCtx.getStore()
    if (job?.cancelada) return resolve({ code: -1, out: '', err: 'cancelado' })
    const p = spawn(cmd, args)
    if (job) { const s = procsDe.get(job.id) ?? new Set(); s.add(p); procsDe.set(job.id, s); p.on('close', () => s.delete(p)) }
    let out = '', err = ''
    p.stdout.on('data', d => { const s = d.toString(); out += s; onOut?.(s) })
    p.stderr.on('data', d => { err += d.toString() })
    p.on('error', e => resolve({ code: -1, out, err: String(e) }))
    p.on('close', code => resolve({ code: code ?? -1, out, err }))
  })
}

function which(bin: string): string | null {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) for (const e of exts) {
    const f = path.join(dir, bin + e)
    try { if (fs.statSync(f).isFile()) return f } catch { /* siguiente */ }
  }
  return null
}

export async function toolsStatus() {
  return {
    ffmpeg: !!which('ffmpeg'), ffprobe: !!which('ffprobe'),
    whisper: !!which('whisper-cli'), whisperModel: await exists(MODEL),
    hwaccel: process.platform === 'darwin' ? 'videotoolbox' : null,
  }
}

const projDir = (slug: string) => path.join(PROJ, slug)

// --- miniaturas y videos de vista previa (livianos, H.264, siempre reproducibles) ---------------------------
const previewing = new Set<string>()
/** Genera <pdir>/<key>.jpg (inmediato) y <key>.mp4 (480 px) a partir del archivo <src>. No toca el original. */
async function ensurePreview(src: string, pdir: string, key: string) {
  const tipo = tipoDe(src) ?? 'video'
  const poster = path.join(pdir, key + '.jpg'), vid = path.join(pdir, key + (tipo === 'audio' ? '.m4a' : '.mp4'))
  if (previewing.has(src) || ((await exists(poster)) && (tipo === 'imagen' || (await exists(vid)))) || !(await exists(src))) return
  previewing.add(src)
  const q = ['-hide_banner', '-loglevel', 'error', '-y']
  try {
    await fsp.mkdir(pdir, { recursive: true })
    if (!(await exists(poster))) {
      if (tipo === 'audio') {
        // imagen de la forma de onda (dorado sobre oscuro)
        await run('ffmpeg', [...q, '-i', src, '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=480x480:colors=#e8b152:split_channels=0,format=yuv420p', '-frames:v', '1', poster])
      } else if (tipo === 'imagen') {
        await run('ffmpeg', [...q, '-i', src, '-frames:v', '1', '-vf', 'scale=480:480:force_original_aspect_ratio=increase,crop=480:480', poster])
      } else {
        const info = await probe(src)
        await run('ffmpeg', [...q, '-ss', String(Math.min(1, (info?.duration ?? 2) / 2)), '-i', src, '-frames:v', '1', '-vf', 'scale=480:-2', poster])
      }
    }
    if (tipo === 'imagen' || (await exists(vid))) return
    const tmp = vid + (tipo === 'audio' ? '.part.m4a' : '.part.mp4')
    if (tipo === 'audio') {
      const r = await run('ffmpeg', [...q, '-i', src, '-vn', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp])
      if (r.code === 0) await fsp.rename(tmp, vid); else await fsp.rm(tmp, { force: true })
      return
    }
    const enc = ['-vf', 'scale=480:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', tmp]
    const hw = process.platform === 'darwin' && !process.env.GOJAGUAR_NO_HWACCEL ? ['-hwaccel', 'videotoolbox'] : []
    let r = await run('ffmpeg', [...q, ...hw, '-i', src, ...enc])
    if (r.code !== 0 && hw.length) r = await run('ffmpeg', [...q, '-i', src, ...enc])
    if (r.code === 0) await fsp.rename(tmp, vid); else await fsp.rm(tmp, { force: true })
  } catch { /* se reintenta en el próximo listado */ } finally { previewing.delete(src) }
}

// --- vista previa de la EDICIÓN actual (cortes + velocidad, sin textos): se rehace cuando cambia el proyecto -----
let finalChain: Promise<void> = Promise.resolve()
const finalPending = new Set<string>()
const atempoChain = (v: number) => { const f: number[] = []; let x = v; while (x > 2) { f.push(2); x /= 2 } while (x < 0.5) { f.push(0.5); x /= 0.5 } f.push(x); return f.map(n => `atempo=${n.toFixed(4)}`).join(',') }

async function generateFinalPreview(slug: string, hash: string) {
  const d = projDir(slug), out = path.join(d, 'salidas')
  await fsp.mkdir(out, { recursive: true })
  const proj = JSON.parse(await fsp.readFile(path.join(d, 'proyecto.gojaguar'), 'utf8')).project as { assets: AssetInfo[]; clips: { assetId: string; srcIn: number; srcOut: number; speed: number }[] }
  if (!proj.clips.length) return
  const ids = [...new Set(proj.clips.map(c => c.assetId))]
  const realPath = (a: AssetInfo) => path.join(ROOT, decodeURIComponent(a.proxy.replace(/^api\/files\//, '')))
  const inputs = ids.map(id => realPath(proj.assets.find(a => a.id === id)!))
  const hasAudio = await Promise.all(inputs.map(async f => (await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f])).out.trim() === 'audio'))
  const audio = hasAudio.every(Boolean)
  const F = 0.006
  const parts: string[] = []
  proj.clips.forEach((c, i) => {
    const k = ids.indexOf(c.assetId), len = (c.srcOut - c.srcIn) / c.speed
    parts.push(`[${k}:v]trim=${c.srcIn.toFixed(3)}:${c.srcOut.toFixed(3)},setpts=(PTS-STARTPTS)/${c.speed},scale=480:-2,fps=30,setsar=1[v${i}]`)
    if (audio) parts.push(`[${k}:a]atrim=${c.srcIn.toFixed(3)}:${c.srcOut.toFixed(3)},asetpts=PTS-STARTPTS,${atempoChain(c.speed)},aresample=44100,afade=t=in:d=${F},afade=t=out:st=${Math.max(0, len - F).toFixed(4)}:d=${F}[a${i}]`)
  })
  const n = proj.clips.length
  parts.push(proj.clips.map((_, i) => `[v${i}]${audio ? `[a${i}]` : ''}`).join('') + `concat=n=${n}:v=1:a=${audio ? 1 : 0}[v]${audio ? '[a]' : ''}`)
  const script = path.join(out, '.vista-previa.filter.txt')
  await fsp.writeFile(script, parts.join(';'))
  const tmp = path.join(out, '.vista-previa.part.mp4')
  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs.flatMap(f => ['-i', f]), '-/filter_complex', script, '-map', '[v]', ...(audio ? ['-map', '[a]'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-b:a', '64k'] : []), '-movflags', '+faststart', tmp]
  const r = await run('ffmpeg', args)
  await fsp.rm(script, { force: true })
  if (r.code !== 0) { await fsp.rm(tmp, { force: true }); throw new Error(r.err.slice(-200)) }
  await fsp.rename(tmp, path.join(out, 'vista-previa.mp4'))
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.3', '-i', path.join(out, 'vista-previa.mp4'), '-frames:v', '1', path.join(out, 'vista-previa.jpg')])
  await fsp.writeFile(path.join(out, 'vista-previa.hash'), hash)
}

async function finalPreviewInfo(slug: string) {
  const d = projDir(slug), f = path.join(d, 'proyecto.gojaguar')
  if (!(await exists(f))) return null
  let hash = ''
  try {
    const p = JSON.parse(await fsp.readFile(f, 'utf8')).project
    hash = crypto.createHash('sha1').update(JSON.stringify([p.clips, p.assets.map((a: AssetInfo) => a.proxy)])).digest('hex').slice(0, 12)
  } catch { return null }
  const out = path.join(d, 'salidas')
  const hasV = await exists(path.join(out, 'vista-previa.mp4')), hasP = await exists(path.join(out, 'vista-previa.jpg'))
  const listo = hasV && hasP && (await fsp.readFile(path.join(out, 'vista-previa.hash'), 'utf8').catch(() => '')) === hash
  if (!listo && !finalPending.has(slug)) {
    finalPending.add(slug)
    finalChain = finalChain.then(() => generateFinalPreview(slug, hash)).catch(() => {}).finally(() => { finalPending.delete(slug) })
  }
  const u = (ext: string) => `api/files/proyectos/${slug}/salidas/vista-previa.${ext}?v=${hash}`
  return { poster: hasP ? u('jpg') : null, video: hasV ? u('mp4') : null, listo }
}

/** Estado de la miniatura de un archivo (src); si falta y el original existe, la pone a generar. */
async function previewInfo(src: string, pdir: string, urlDir: string, key: string) {
  const tipo = tipoDe(src) ?? 'video'
  const hasPoster = await exists(path.join(pdir, key + '.jpg'))
  const hasMedia = tipo === 'imagen' ? false : await exists(path.join(pdir, key + (tipo === 'audio' ? '.m4a' : '.mp4')))
  const listo = hasPoster && (tipo === 'imagen' || hasMedia)
  if (!listo) void ensurePreview(src, pdir, key)
  const u = (ext: string) => `api/files/${urlDir}/${encodeURIComponent(key)}.${ext}`
  return { poster: hasPoster ? u('jpg') : null, video: tipo === 'video' && hasMedia ? u('mp4') : null, audio: tipo === 'audio' && hasMedia ? u('m4a') : null, listo }
}
const rmPreview = (pdir: string, key: string) => Promise.all(['.jpg', '.mp4', '.m4a'].map(e => fsp.rm(path.join(pdir, key + e), { force: true })))

// --- ritmo de la música (BPM, pulsos, golpes): se calcula una vez y queda en analisis/<id>.ritmo.json ------------
const ritmando = new Set<string>()
async function ritmoDe(slug: string, f: Fuente) {
  if (f.tipo !== 'audio' || !f.existe) return null
  const dir = path.join(projDir(slug), 'analisis'), out = path.join(dir, safeName(f.stem) + '.ritmo.json')
  const hecho = await readJson<(Ritmo & { fuente: number }) | null>(out, null)
  const mt = (await fsp.stat(f.ruta)).mtimeMs
  if (hecho && hecho.fuente === mt) return { bpm: hecho.bpm, bpmAlt: hecho.bpmAlt, confianza: hecho.confianza, duracion: hecho.duracion }
  if (!ritmando.has(out)) {
    ritmando.add(out)
    void (async () => {
      try { await fsp.mkdir(dir, { recursive: true }); await writeJson(out, { ...(await analizarRitmo(f.ruta)), fuente: mt }) }
      catch { /* sin ritmo: la tarjeta sigue funcionando */ } finally { ritmando.delete(out) }
    })()
  }
  return null
}

async function ensureLibrary() { await fsp.mkdir(PROJ, { recursive: true }); await fsp.mkdir(REFS, { recursive: true }); await fsp.mkdir(SOL, { recursive: true }) }

// --- pedidos a Claude: el botón deja un archivo; Claude (vigilando en el chat) lo recibe y lo ejecuta ----------
export interface Solicitud { id: string; slug: string; tipo: 'errores' | 'completa'; estado: 'pendiente' | 'en_curso' | 'hecho' | 'error' | 'cancelado'; creado: string; referencias: string[]; recomendacion?: string; nota?: string }
async function crearSolicitud(slug: string, tipo: Solicitud['tipo'], referencias: string[], recomendacion?: string): Promise<Solicitud> {
  const activa = (await solicitudesDe(slug)).find(x => x.tipo === tipo && (x.estado === 'pendiente' || x.estado === 'en_curso'))
  if (activa) return activa
  const sol: Solicitud = { id: `${Date.now()}-${slug}-${tipo}`, slug, tipo, estado: 'pendiente', creado: new Date().toISOString(), referencias, ...(recomendacion ? { recomendacion } : {}) }
  await writeJson(path.join(SOL, sol.id + '.json'), sol)
  return sol
}
const leerSolicitud = (id: string) => readJson<Solicitud | null>(path.join(SOL, safeName(id) + '.json'), null)
async function solicitudesDe(slug: string) {
  const out: Solicitud[] = []
  for (const n of await fsp.readdir(SOL)) if (n.endsWith('.json')) { const x = await readJson<Solicitud | null>(path.join(SOL, n), null); if (x?.slug === slug) out.push(x) }
  return out.sort((a, b) => b.creado.localeCompare(a.creado))
}

interface ProjectMeta {
  name: string; slug: string; createdAt: string; idioma: string
  referencias: string[]
  procesado?: string        // fecha ISO
  assets?: AssetInfo[]
  material?: MaterialRef[]  // videos ENLAZADOS (no se copian); los copiados viven en material/
}

/** Video enlazado: solo guardamos dónde está. El original nunca se copia ni se borra desde la app. */
interface MaterialRef { id: string; name: string; stem: string; ruta: string; size: number }
interface Fuente { id: string; tipo: Tipo; name: string; stem: string; modo: 'enlace' | 'copia'; ruta: string; size: number; existe: boolean }
const stemOf = (n: string) => path.basename(n, path.extname(n))
const isVideoName = (n: string) => VIDEO_EXT.has(path.extname(n).toLowerCase())
const isMaterialName = (n: string) => tipoDe(n) !== null

async function loadMeta(slug: string) { return readJson<ProjectMeta | null>(path.join(projDir(slug), 'proyecto.json'), null) }

async function listFiles(dir: string) {
  if (!(await exists(dir))) return []
  const out = []
  for (const n of await fsp.readdir(dir)) {
    if (n.startsWith('.')) continue
    const st = await fsp.stat(path.join(dir, n))
    if (st.isFile()) out.push({ name: n, size: st.size, mtime: st.mtime.toISOString() })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function listMaterial(slug: string): Promise<Fuente[]> {
  const meta = await loadMeta(slug), d = projDir(slug), out: Fuente[] = []
  for (const r of meta?.material ?? []) {
    const ok = await exists(r.ruta)
    out.push({ id: r.id, tipo: tipoDe(r.name) ?? 'video', name: r.name, stem: r.stem, modo: 'enlace', ruta: r.ruta, size: ok ? (await fsp.stat(r.ruta)).size : r.size, existe: ok })
  }
  for (const f of await listFiles(path.join(d, 'material'))) if (isMaterialName(f.name)) out.push({ id: f.name, tipo: tipoDe(f.name)!, name: f.name, stem: stemOf(f.name), modo: 'copia', ruta: path.join(d, 'material', f.name), size: f.size, existe: true })
  return out
}

/** Enlaza videos por su ruta (sin copiar). Devuelve los nombres agregados. */
async function linkMaterial(slug: string, rutas: string[]) {
  const meta = (await loadMeta(slug))!
  meta.material ??= []
  const usados = new Set((await listMaterial(slug)).map(f => f.stem))
  const agregados: string[] = []
  for (const ruta of rutas) {
    if (!path.isAbsolute(ruta) || !isMaterialName(ruta)) continue
    const st = await fsp.stat(ruta).catch(() => null); if (!st?.isFile()) continue
    if (meta.material.some(r => r.ruta === ruta)) continue
    let stem = stemOf(ruta), i = 2; const base = stem
    while (usados.has(stem)) stem = `${base}-${i++}`
    usados.add(stem)
    meta.material.push({ id: `e-${crypto.randomBytes(4).toString('hex')}`, name: path.basename(ruta), stem, ruta, size: st.size })
    agregados.push(path.basename(ruta))
  }
  await writeJson(path.join(projDir(slug), 'proyecto.json'), meta)
  return agregados
}

async function projectInfo(slug: string) {
  const meta = await loadMeta(slug); if (!meta) return null
  const d = projDir(slug)
  return {
    ...meta,
    material: await Promise.all((await listMaterial(slug)).map(async f => ({ id: f.id, tipo: f.tipo, ritmo: await ritmoDe(slug, f), name: f.name, modo: f.modo, existe: f.existe, ruta: f.ruta, size: f.size, preview: await previewInfo(f.ruta, path.join(d, '.previews'), `proyectos/${slug}/.previews`, f.id) }))),
    tieneEditor: await exists(path.join(d, 'proyecto.gojaguar')),
    vistaFinal: await finalPreviewInfo(slug),
  }
}

async function listProjects() {
  await ensureLibrary()
  const out = []
  for (const slug of await fsp.readdir(PROJ)) {
    if (!isSlug(slug)) continue
    const info = await projectInfo(slug); if (!info) continue
    const { material, assets, name, createdAt, procesado, tieneEditor, referencias, vistaFinal } = info
    const preview = vistaFinal ? { ...vistaFinal, tipo: 'edicion' as const } : (material.find(m => m.tipo === 'video') ?? material[0]) ? { ...(material.find(m => m.tipo === 'video') ?? material[0]).preview, tipo: 'material' as const } : null
    const edit = path.join(projDir(slug), 'proyecto.gojaguar')
    const ultimaEdicion = (await exists(edit)) ? (await fsp.stat(edit)).mtime.toISOString() : createdAt
    out.push({ slug, name, createdAt, ultimaEdicion, procesado: !!procesado, tieneEditor, material: material.length, preview, referencias: referencias.length, duracion: (assets ?? []).reduce((s, a) => s + a.duration, 0) })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

interface RefLink { id: string; name: string; stem: string; ruta: string; size: number; agregada: string }

async function listReferences() {
  await ensureLibrary()
  type Ref = { id: string; nombre: string; size: number; agregada: string; modo: 'enlace' | 'copia'; existe: boolean; ruta: string; perfilDeEstilo: boolean; preview: Awaited<ReturnType<typeof previewInfo>> }
  const out: Ref[] = []
  const push = async (id: string, nombre: string, modo: 'enlace' | 'copia', ruta: string, size: number, agregada: string) => {
    const existe = await exists(ruta)
    out.push({ id, nombre, size: existe ? (await fsp.stat(ruta)).size : size, agregada, modo, existe, ruta,
      perfilDeEstilo: await exists(path.join(REFS, `${nombre}.estilo.json`)), preview: await previewInfo(ruta, path.join(REFS, '.previews'), 'referencias/.previews', id) })
  }
  for (const f of await listFiles(REFS)) {
    if (f.name.endsWith('.ref.json')) { const r = await readJson<RefLink | null>(path.join(REFS, f.name), null); if (r) await push(r.id, r.stem, 'enlace', r.ruta, r.size, r.agregada) }
    else if (!f.name.endsWith('.json') && isVideoName(f.name)) await push(f.name, stemOf(f.name), 'copia', path.join(REFS, f.name), f.size, f.mtime)
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

async function linkReferences(rutas: string[]) {
  const usados = new Set((await listReferences()).map(r => r.nombre))
  const agregados: string[] = [], ids: string[] = []
  for (const ruta of rutas) {
    if (!path.isAbsolute(ruta) || !isVideoName(ruta)) continue
    const st = await fsp.stat(ruta).catch(() => null); if (!st?.isFile()) continue
    if ((await listReferences()).some(r => r.ruta === ruta)) continue
    let stem = stemOf(ruta), i = 2; const base = stem
    while (usados.has(stem)) stem = `${base}-${i++}`
    usados.add(stem)
    const id = `e-${crypto.randomBytes(4).toString('hex')}`
    await writeJson(path.join(REFS, `${id}.ref.json`), { id, name: path.basename(ruta), stem, ruta, size: st.size, agregada: new Date().toISOString() } satisfies RefLink)
    agregados.push(path.basename(ruta)); ids.push(id)
  }
  return { agregados, ids }
}

/** Marca referencias como elegidas en un proyecto (para que una referencia nueva quede seleccionada sola). */
async function seleccionarEnProyecto(slug: string | null, ids: string[]) {
  if (!slug || !isSlug(slug) || !ids.length) return
  const meta = await loadMeta(slug); if (!meta) return
  meta.referencias = [...new Set([...(meta.referencias ?? []), ...ids])]
  await writeJson(path.join(projDir(slug), 'proyecto.json'), meta)
}

// --- diálogo nativo para elegir archivos (devuelve rutas reales: así no hace falta copiar nada) ----------------
async function pickFiles(multiple: boolean, titulo: string, todo = false): Promise<string[]> {
  let r: { code: number; out: string }
  if (process.platform === 'darwin') {
    const lines = ['tell me to activate',
      `set r to choose file with prompt "${titulo.replace(/"/g, '')}" of type {${todo ? '"public.movie","public.audio","public.image"' : '"public.movie"'}}${multiple ? ' with multiple selections allowed' : ''}`,
      'if class of r is not list then set r to {r}', 'set o to {}', 'repeat with f in r', 'set end of o to POSIX path of f', 'end repeat',
      'set AppleScript\'s text item delimiters to linefeed', 'return o as text']
    r = await run('osascript', lines.flatMap(l => ['-e', l]))
  } else if (process.platform === 'win32') {
    r = await run('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.OpenFileDialog; $f.Title='${titulo}'; $f.Multiselect=$${multiple}; $f.Filter='${todo ? 'Material|*.mp4;*.mov;*.m4v;*.mkv;*.webm;*.avi;*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.jpg;*.jpeg;*.png;*.webp;*.heic|Todos|*.*' : 'Videos|*.mp4;*.mov;*.m4v;*.mkv;*.webm;*.avi|Todos|*.*'}'; if($f.ShowDialog() -eq 'OK'){ $f.FileNames -join [char]10 }`])
  } else {
    r = await run('zenity', ['--file-selection', `--title=${titulo}`, ...(multiple ? ['--multiple', '--separator=\n'] : [])])
  }
  return r.code === 0 ? r.out.split('\n').map(x => x.trim()).filter(Boolean) : []   // cancelar = lista vacía
}

/** Busca en el disco el original de un archivo arrastrado (mismo nombre, tamaño y fecha) para enlazarlo sin copiarlo. Solo macOS. */
async function locateFile(name: string, size: number, lastModified: number): Promise<string | null> {
  if (process.platform !== 'darwin') return null
  const r = await run('mdfind', ['-name', name])
  for (const f of r.out.split('\n').map(x => x.trim()).filter(Boolean)) {
    if (path.basename(f) !== name || f.startsWith(ROOT)) continue
    const st = await fsp.stat(f).catch(() => null)
    if (st?.isFile() && st.size === size && Math.abs(st.mtimeMs - lastModified) < 2000) return f
  }
  return null
}

// --- trabajos (procesamiento en segundo plano) ---------------------------------------------------
interface Step { id: string; label: string; state: 'pending' | 'running' | 'done' | 'error' | 'skipped'; detail?: string; pct?: number }
interface Job { id: string; slug: string; status: 'running' | 'done' | 'error' | 'cancelado'; steps: Step[]; error?: string; cancelada?: boolean; solicitud?: string }
const jobs = new Map<string, Job>()

function newJob(slug: string): Job {
  const job: Job = {
    id: `${slug}-${Date.now()}`, slug, status: 'running',
    steps: [
      { id: 'proxy', label: 'Preparando los videos para editar', state: 'pending' },
      { id: 'texto', label: 'Convirtiendo el audio en texto', state: 'pending' },
      { id: 'silencios', label: 'Detectando silencios', state: 'pending' },
      { id: 'base', label: 'Armando la edición base (sin silencios)', state: 'pending' },
      { id: 'claude', label: 'Claude: quitar lo repetido y ordenar el guion', state: 'pending' },
    ],
  }
  jobs.set(job.id, job)
  return job
}
const step = (job: Job, id: string) => job.steps.find(s => s.id === id)!

async function probe(file: string) {
  const r = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file])
  if (r.code !== 0) return null
  try {
    const j = JSON.parse(r.out)
    const s = j.streams?.[0]; if (!s) return null
    const [n, d] = String(s.r_frame_rate).split('/').map(Number)
    return { width: s.width as number, height: s.height as number, fps: Math.round((n / (d || 1)) * 1000) / 1000 || 30, duration: Number(j.format.duration) }
  } catch { return null }
}

async function makeProxy(src: string, dst: string, duration: number, onPct: (p: number) => void) {
  const base = ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-y']
  const tmp = dst + '.part.mp4'   // si se cancela a medias no queda un proxy roto
  const enc = ['-vf', 'scale=640:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-g', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp]
  const track = (s: string) => { const m = /out_time_us=(\d+)/.exec(s.split('\n').filter(l => l.startsWith('out_time_us=')).pop() ?? ''); if (m) onPct(Math.min(1, Number(m[1]) / 1e6 / duration)) }
  const hw = process.platform === 'darwin' && !process.env.GOJAGUAR_NO_HWACCEL ? ['-hwaccel', 'videotoolbox'] : []
  let r = await run('ffmpeg', [...base, ...hw, '-i', src, ...enc], track)
  if (r.code !== 0 && hw.length) r = await run('ffmpeg', [...base, '-i', src, ...enc], track)
  if (r.code !== 0) { await fsp.rm(tmp, { force: true }); throw new Error(r.err === 'cancelado' ? 'Cancelado' : 'ffmpeg falló: ' + r.err.slice(-300)) }
  await fsp.rename(tmp, dst)
}

function groupLines(words: { i: number; t0: number; w: string; t1: number }[]) {
  const lines: typeof words[] = []; let cur: typeof words = []
  words.forEach((w, k) => {
    cur.push(w)
    const nx = words[k + 1]
    const gap = nx ? nx.t0 - w.t1 : 9
    if (gap >= 0.45 || /[.?!]$/.test(w.w) || cur.length >= 28) { lines.push(cur); cur = [] }
  })
  if (cur.length) lines.push(cur)
  const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`
  return lines.map((l, n) => `L${n} ${tc(l[0].t0)} w${l[0].i}-w${l[l.length - 1].i} ${l.map(x => x.w).join(' ')}`).join('\n')
}

async function transcribe(proxy: string, outPrefix: string, idioma: string) {
  const wav = outPrefix + '.16k.wav'
  const a = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', proxy, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav])
  if (a.code !== 0) { await fsp.rm(wav, { force: true }); throw new Error('No pude extraer el audio') }
  const w = await run('whisper-cli', ['-m', MODEL, '-f', wav, '-l', idioma, '-t', String(Math.max(2, os.cpus().length - 2)), '-ml', '1', '-sow', '-oj', '-of', outPrefix + '.whisper'])
  await fsp.rm(wav, { force: true })
  if (w.code !== 0) throw new Error('Whisper falló: ' + w.err.slice(-200))
  const raw = await readJson<{ transcription: { text: string; offsets: { from: number; to: number } }[] }>(outPrefix + '.whisper.json', { transcription: [] })
  await fsp.rm(outPrefix + '.whisper.json', { force: true })
  const words: { i: number; t0: number; t1: number; w: string }[] = []
  for (const s of raw.transcription) {
    const t = s.text.trim(); if (!t) continue
    words.push({ i: words.length, t0: +(s.offsets.from / 1000).toFixed(2), t1: +(s.offsets.to / 1000).toFixed(2), w: t })
  }
  await fsp.writeFile(outPrefix + '.words.json', JSON.stringify(words))
  await fsp.writeFile(outPrefix + '.lineas.txt', groupLines(words))
  return words.length
}

async function detectSilences(proxy: string, duration: number) {
  const r = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', proxy, '-vn', '-af', 'silencedetect=noise=-32dB:d=0.45', '-f', 'null', '-'])
  const sil: [number, number][] = []; let st: number | null = null
  for (const l of r.err.split('\n')) {
    let m = /silence_start: ([\d.]+)/.exec(l); if (m) st = Number(m[1])
    m = /silence_end: ([\d.]+)/.exec(l); if (m && st !== null) { sil.push([st, Number(m[1])]); st = null }
  }
  if (st !== null) sil.push([st, duration])
  const ranges: [number, number][] = []
  for (const [a, b] of sil) {
    const from = a < 0.05 ? 0 : a + 0.09, to = b >= duration - 0.05 ? duration : b - 0.09
    if (to - from >= 0.25) ranges.push([+from.toFixed(3), +to.toFixed(3)])
  }
  return ranges
}

const keepSegments = (duration: number, cuts: [number, number][]) => {
  const keep: [number, number][] = []; let cur = 0
  for (const [a, b] of [...cuts].sort((x, y) => x[0] - y[0])) { if (a - cur > 0.05) keep.push([cur, a]); cur = Math.max(cur, b) }
  if (duration - cur > 0.05) keep.push([cur, duration])
  return keep
}

/** Cancela un trabajo: detiene ffmpeg/whisper al instante y anula el pedido a Claude si ya se había enviado. */
async function cancelarTrabajo(job: Job) {
  if (job.status !== 'running') return
  job.cancelada = true
  for (const p of procsDe.get(job.id) ?? []) p.kill('SIGKILL')
  if (job.solicitud) {
    const x = await leerSolicitud(job.solicitud)
    if (x && (x.estado === 'pendiente' || x.estado === 'en_curso')) await writeJson(path.join(SOL, x.id + '.json'), { ...x, estado: 'cancelado', nota: 'Cancelado por el usuario' })
  }
}

const processProject = (job: Job) => jobCtx.run(job, () => processProjectInner(job))
async function processProjectInner(job: Job) {
  const slug = job.slug, d = projDir(slug)
  const meta = (await loadMeta(slug))!
  const set = (id: string, p: Partial<Step>) => { if (job.cancelada) throw new Error('Cancelado'); return Object.assign(step(job, id), p) }
  try {
    const files = (await listMaterial(slug)).filter(f => f.tipo === 'video')
    if (!files.length) throw new Error('No hay videos en el material')
    for (const sub of ['proxies', 'transcripciones', 'analisis', 'salidas']) await fsp.mkdir(path.join(d, sub), { recursive: true })
    const tools = await toolsStatus()
    if (!tools.ffmpeg || !tools.ffprobe) throw new Error('Falta ffmpeg. Instálalo (Mac: brew install ffmpeg) y vuelve a intentar.')

    // 1) proxies ---------------------------------------------------------------------------
    set('proxy', { state: 'running', pct: 0 })
    const assets: AssetInfo[] = []; const stems: string[] = []
    for (const [k, f] of files.entries()) {
      const src = f.ruta, stem = f.stem
      const dst = path.join(d, 'proxies', `${stem}.proxy.mp4`)
      set('proxy', { detail: `${f.name} (${k + 1}/${files.length})` })
      let info: { width: number; height: number; fps: number; duration: number }
      if (f.existe) {
        const pr = await probe(src); if (!pr) throw new Error(`No pude leer "${f.name}" (¿es un video?)`)
        info = pr
        const fresh = (await exists(dst)) && (await fsp.stat(dst)).mtimeMs > (await fsp.stat(src)).mtimeMs
        if (!fresh) await makeProxy(src, dst, info.duration, p => set('proxy', { pct: (k + p) / files.length }))
      } else {
        // el original se movió o se borró: se sigue editando con la copia liviana si ya existe
        const prev = meta.assets?.find(a => a.name === stem)
        if (!(await exists(dst)) || !prev) throw new Error(`No encuentro el original de "${f.name}". Pulsa "Ubicar" en su tarjeta y elígelo de nuevo.`)
        info = { width: prev.width, height: prev.height, fps: prev.fps, duration: prev.duration }
      }
      set('proxy', { pct: (k + 1) / files.length })
      assets.push({ id: `a${k + 1}`, name: stem, kind: 'video', proxy: `api/files/proyectos/${slug}/proxies/${encodeURIComponent(stem)}.proxy.mp4`, original: src, ...info })
      stems.push(stem)
    }
    set('proxy', { state: 'done', detail: undefined })

    // 2) transcripción ---------------------------------------------------------------------
    if (!tools.whisper || !tools.whisperModel) {
      set('texto', { state: 'skipped', detail: !tools.whisper ? 'Falta whisper-cli (whisper.cpp)' : `Falta el modelo (${MODEL})` })
    } else {
      set('texto', { state: 'running' })
      let total = 0
      for (const [k, stem] of stems.entries()) {
        set('texto', { detail: `${stem} (${k + 1}/${stems.length})` })
        total += await transcribe(path.join(d, 'proxies', `${stem}.proxy.mp4`), path.join(d, 'transcripciones', stem), meta.idioma)
      }
      set('texto', { state: 'done', detail: `${total} palabras` })
    }

    // 3) silencios ---------------------------------------------------------------------------
    set('silencios', { state: 'running' })
    const cuts = new Map<string, [number, number][]>()
    for (const [k, a] of assets.entries()) {
      const r = await detectSilences(path.join(d, 'proxies', `${stems[k]}.proxy.mp4`), a.duration)
      cuts.set(a.id, r); await writeJson(path.join(d, 'analisis', `${stems[k]}.silencios.json`), r)
    }
    const nSil = [...cuts.values()].reduce((s, r) => s + r.length, 0)
    set('silencios', { state: 'done', detail: `${nSil} pausas largas` })

    // 4) edición base ---------------------------------------------------------------------------
    set('base', { state: 'running' })
    const first = assets[0]
    const store = new Store(createProject(meta.name, { width: first.width, height: first.height, fps: Math.round(first.fps) || 30 }))
    for (const a of assets) exec(store, { op: 'import_asset', asset: a })
    for (const a of assets) {
      const cmds: Cmd[] = keepSegments(a.duration, cuts.get(a.id) ?? []).map(([s, e]) => ({ op: 'add_clip', asset: a.id, src_in: s, src_out: e }))
      execBatch(store, cmds)
    }
    await fsp.writeFile(path.join(d, 'proyecto.gojaguar'), serialize(store.project))
    const total = assets.reduce((s, a) => s + a.duration, 0)
    set('base', { state: 'done', detail: `${Math.round(total)} s → ${Math.round(store.project.clips.reduce((s, c) => s + (c.srcOut - c.srcIn), 0))} s` })

    await writeJson(path.join(d, 'proyecto.json'), { ...meta, procesado: new Date().toISOString(), assets })

    // 5) Claude: quita lo repetido y ordena el guion (le llega el pedido en el chat) ---------------------------
    set('claude', { state: 'running', detail: 'enviado, esperando a Claude…' })
    const sol = await crearSolicitud(slug, 'errores', [])
    job.solicitud = sol.id
    const t0 = Date.now()
    for (;;) {
      const x = await leerSolicitud(sol.id)
      if (x?.estado === 'hecho') break
      if (x?.estado === 'error') throw new Error(x.nota ?? 'Claude no pudo terminar')
      set('claude', { detail: x?.estado === 'en_curso' ? 'Claude está editando…' : Date.now() - t0 > 20000 ? 'esperando a Claude (¿está abierto Claude Code en esta carpeta?)' : 'enviado, esperando a Claude…' })
      await new Promise(r => setTimeout(r, 1500))
    }
    set('claude', { state: 'done', detail: undefined })
    job.status = 'done'
  } catch (e) {
    const cur = job.steps.find(s => s.state === 'running')
    if (job.cancelada) {
      if (cur) { cur.state = 'skipped'; cur.detail = 'cancelado' }
      job.status = 'cancelado'; job.error = 'Cancelado. Lo que ya estaba hecho se conserva.'
    } else {
      if (cur) { cur.state = 'error'; cur.detail = (e as Error).message }
      job.status = 'error'; job.error = (e as Error).message
    }
    procsDe.delete(job.id)
  }
}

// --- enrutador -----------------------------------------------------------------------------------------
async function serveFile(req: IncomingMessage, res: ServerResponse, rel: string) {
  const abs = path.resolve(ROOT, decodeURIComponent(rel))
  if (!abs.startsWith(ROOT + path.sep) || !(await exists(abs))) return send(res, 404, { error: 'no existe' })
  const st = await fsp.stat(abs)
  if (!st.isFile()) return send(res, 404, { error: 'no es un archivo' })
  res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Accept-Ranges', 'bytes')
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
  if (range) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : st.size - 1
    res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`); res.setHeader('Content-Length', end - start + 1)
    fs.createReadStream(abs, { start, end }).pipe(res)
  } else { res.setHeader('Content-Length', st.size); fs.createReadStream(abs).pipe(res) }
}

function saveStream(req: IncomingMessage, dest: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest); let n = 0
    req.on('data', c => { n += c.length })
    req.pipe(ws)
    ws.on('finish', () => resolve(n)); ws.on('error', reject); req.on('error', reject)
  })
}

export async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://x')
  const p = url.pathname.replace(/\/+$/, '') || '/'
  const m = req.method ?? 'GET'
  let g: RegExpExecArray | null
  try {
    await ensureLibrary()
    if (m === 'GET' && p === '/estado') return send(res, 200, { biblioteca: ROOT, herramientas: await toolsStatus(), proyectos: await listProjects(), referencias: await listReferences() })

    if (m === 'POST' && p === '/proyectos') {
      const { name, idioma } = JSON.parse((await readBody(req)) || '{}') as { name?: string; idioma?: string }
      const nombre = (name ?? '').trim(); if (!nombre) return send(res, 400, { error: 'Falta el nombre' })
      let slug = slugify(nombre), i = 2
      while (await exists(projDir(slug))) slug = `${slugify(nombre)}-${i++}`
      for (const sub of ['material', 'proxies', 'transcripciones', 'analisis', 'salidas']) await fsp.mkdir(path.join(projDir(slug), sub), { recursive: true })
      const meta: ProjectMeta = { name: nombre, slug, createdAt: new Date().toISOString(), idioma: idioma || 'auto', referencias: [] }
      await writeJson(path.join(projDir(slug), 'proyecto.json'), meta)
      return send(res, 200, meta)
    }

    // Borrar un proyecto: se elimina su carpeta (edición, proxies, copias). Los videos ENLAZADOS no se tocan.
    if ((g = /^\/proyectos\/([a-z0-9-]+)$/.exec(p)) && m === 'DELETE') {
      const dir = projDir(g[1])
      if (!isSlug(g[1]) || !(await loadMeta(g[1])) || !path.resolve(dir).startsWith(PROJ + path.sep)) return send(res, 404, { error: 'Proyecto no encontrado' })
      await fsp.rm(dir, { recursive: true, force: true })
      return send(res, 200, { ok: true })
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)$/.exec(p)) && m === 'GET') {
      const info = isSlug(g[1]) ? await projectInfo(g[1]) : null
      return info ? send(res, 200, info) : send(res, 404, { error: 'Proyecto no encontrado' })
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)\/material$/.exec(p)) && m === 'PUT') {
      if (!isSlug(g[1]) || !(await loadMeta(g[1]))) return send(res, 404, { error: 'Proyecto no encontrado' })
      const dir = path.join(projDir(g[1]), 'material'); await fsp.mkdir(dir, { recursive: true })
      const name = await uniqueName(dir, safeName(url.searchParams.get('filename') ?? 'video.mp4'))
      const size = await saveStream(req, path.join(dir, name))
      return send(res, 200, { name, size, modo: 'copia' })
    }

    // Elegir con el diálogo nativo: se ENLAZA (no se copia)
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/material\/elegir$/.exec(p)) && m === 'POST') {
      if (!isSlug(g[1]) || !(await loadMeta(g[1]))) return send(res, 404, { error: 'Proyecto no encontrado' })
      const rutas = await pickFiles(true, 'Elige videos, música o imágenes del proyecto', true)
      return send(res, 200, { agregados: await linkMaterial(g[1], rutas), cancelado: rutas.length === 0 })
    }
    // Arrastrar y soltar: el navegador no da la ruta; se busca el original por nombre+tamaño+fecha y se enlaza
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/material\/enlazar$/.exec(p)) && m === 'POST') {
      if (!isSlug(g[1]) || !(await loadMeta(g[1]))) return send(res, 404, { error: 'Proyecto no encontrado' })
      const { archivos } = JSON.parse((await readBody(req)) || '{}') as { archivos: { name: string; size: number; lastModified: number }[] }
      const rutas: string[] = [], faltan: string[] = []
      for (const a of archivos ?? []) { const r = await locateFile(a.name, a.size, a.lastModified); r ? rutas.push(r) : faltan.push(a.name) }
      return send(res, 200, { enlazados: await linkMaterial(g[1], rutas), noEncontrados: faltan })
    }
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/material\/([^/]+)\/ubicar$/.exec(p)) && m === 'POST') {
      const meta = isSlug(g[1]) ? await loadMeta(g[1]) : null
      const ref = meta?.material?.find(r => r.id === decodeURIComponent(g![2]))
      if (!meta || !ref) return send(res, 404, { error: 'No es un archivo enlazado' })
      const [ruta] = await pickFiles(false, `Ubica de nuevo: ${ref.name}`, true)
      if (ruta) { ref.ruta = ruta; ref.name = path.basename(ruta); ref.size = (await fsp.stat(ruta)).size; await writeJson(path.join(projDir(g[1]), 'proyecto.json'), meta) }
      return send(res, 200, { ok: !!ruta })
    }
    // Quitar del proyecto: si es un enlace NO se toca el original; si es una copia, se borra la copia
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/material\/(.+)$/.exec(p)) && m === 'DELETE') {
      const id = decodeURIComponent(g[2]), d = projDir(g[1]), meta = isSlug(g[1]) ? await loadMeta(g[1]) : null
      if (!meta) return send(res, 404, { error: 'Proyecto no encontrado' })
      if (meta.material?.some(r => r.id === id)) { meta.material = meta.material.filter(r => r.id !== id); await writeJson(path.join(d, 'proyecto.json'), meta) }
      else await fsp.rm(path.join(d, 'material', safeName(id)), { force: true })
      await rmPreview(path.join(d, '.previews'), id)
      return send(res, 200, { ok: true })
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)\/procesar$/.exec(p)) && m === 'POST') {
      if (!isSlug(g[1]) || !(await loadMeta(g[1]))) return send(res, 404, { error: 'Proyecto no encontrado' })
      const running = [...jobs.values()].find(j => j.slug === g![1] && j.status === 'running')
      if (running) return send(res, 200, { jobId: running.id })
      const job = newJob(g[1]); void processProject(job)
      return send(res, 200, { jobId: job.id })
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)\/trabajo$/.exec(p)) && m === 'GET') {
      const j = [...jobs.values()].filter(x => x.slug === g![1] && x.status === 'running').pop()
      return send(res, 200, j ?? null)
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)\/pedir$/.exec(p)) && m === 'POST') {
      const meta = isSlug(g[1]) ? await loadMeta(g[1]) : null
      if (!meta) return send(res, 404, { error: 'Proyecto no encontrado' })
      const { tipo, recomendacion } = JSON.parse((await readBody(req)) || '{}') as { tipo?: string; recomendacion?: string }
      if (tipo !== 'completa') return send(res, 400, { error: 'Tipo de pedido no válido' })
      if (!meta.procesado) return send(res, 400, { error: 'Primero usa "Recorta silencios y errores"' })
      if (!meta.referencias.length) return send(res, 400, { error: 'Marca al menos una referencia' })
      return send(res, 200, await crearSolicitud(meta.slug, 'completa', meta.referencias, (recomendacion ?? '').trim().slice(0, 2000) || undefined))
    }

    if ((g = /^\/solicitudes\/([^/]+)\/cancelar$/.exec(p)) && m === 'POST') {
      const x = await leerSolicitud(decodeURIComponent(g[1]))
      if (!x) return send(res, 404, { error: 'Pedido no encontrado' })
      if (x.estado === 'pendiente' || x.estado === 'en_curso') await writeJson(path.join(SOL, x.id + '.json'), { ...x, estado: 'cancelado', nota: 'Cancelado por el usuario' })
      return send(res, 200, { ok: true })
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)\/solicitudes$/.exec(p)) && m === 'GET') {
      return send(res, 200, isSlug(g[1]) ? await solicitudesDe(g[1]) : [])
    }

    // Prepara para el editor los archivos del Material que aún no están en la edición (proxy liviano de video, audio de vista previa)
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/preparar$/.exec(p)) && m === 'POST') {
      const meta = isSlug(g[1]) ? await loadMeta(g[1]) : null
      const file = isSlug(g[1]) ? path.join(projDir(g[1]), 'proyecto.gojaguar') : ''
      if (!meta) return send(res, 404, { error: 'Proyecto no encontrado' })
      if (!(await exists(file))) return send(res, 400, { error: 'Primero crea la edición con "Recorta silencios y errores"' })
      const project = JSON.parse(await fsp.readFile(file, 'utf8')).project as { assets: AssetInfo[] }
      const known = new Set(project.assets.map(a => a.original))
      let n = project.assets.reduce((mx, a) => Math.max(mx, Number(/(\d+)$/.exec(a.id)?.[1] ?? 0)), 0)
      const nuevos: AssetInfo[] = [], omitidos: string[] = []
      const d = projDir(g[1])
      for (const f of await listMaterial(g[1])) {
        if (!f.existe || known.has(f.ruta)) continue
        if (f.tipo === 'imagen') { omitidos.push(f.name); continue }
        n++
        if (f.tipo === 'video') {
          const pr = await probe(f.ruta); if (!pr) { omitidos.push(f.name); continue }
          const dst = path.join(d, 'proxies', `${f.stem}.proxy.mp4`)
          await fsp.mkdir(path.dirname(dst), { recursive: true })
          if (!(await exists(dst))) await makeProxy(f.ruta, dst, pr.duration, () => {})
          nuevos.push({ id: `a${n}`, name: f.stem, kind: 'video', proxy: `api/files/proyectos/${g[1]}/proxies/${encodeURIComponent(f.stem)}.proxy.mp4`, original: f.ruta, ...pr })
        } else {
          await ensurePreview(f.ruta, path.join(d, '.previews'), f.id)
          const dur = Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f.ruta])).out.trim())
          if (!(await exists(path.join(d, '.previews', f.id + '.m4a'))) || !(dur > 0)) { omitidos.push(f.name); continue }
          nuevos.push({ id: `m${n}`, name: f.stem, kind: 'audio', proxy: `api/files/proyectos/${g[1]}/.previews/${encodeURIComponent(f.id)}.m4a`, original: f.ruta, duration: dur, fps: 0, width: 0, height: 0 })
        }
      }
      return send(res, 200, { assets: nuevos, omitidos })
    }

    // --- exportar a MP4 (la edición actual, con efectos, superpuestos y música) ---
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/exportar$/.exec(p)) && m === 'POST') {
      const meta = isSlug(g[1]) ? await loadMeta(g[1]) : null
      if (!meta) return send(res, 404, { error: 'Proyecto no encontrado' })
      const body = JSON.parse((await readBody(req)) || '{}') as Partial<ExportOpts>
      const opts: ExportOpts = {
        resolucion: (['original', '720', '480'] as const).includes(body.resolucion as never) ? body.resolucion! : 'original',
        calidad: (['rapida', 'buena', 'maxima'] as const).includes(body.calidad as never) ? body.calidad! : 'buena',
        nombre: (body.nombre ?? meta.name).slice(0, 80),
      }
      const f = path.join(projDir(g[1]), 'proyecto.gojaguar')
      if (!(await exists(f))) return send(res, 400, { error: 'Este proyecto aún no tiene edición' })
      return send(res, 200, await startExport(g[1], f, path.join(projDir(g[1]), 'salidas'), ROOT, opts, `http://${req.headers.host ?? '127.0.0.1:5273'}`))
    }
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/exportar$/.exec(p)) && m === 'GET') {
      return send(res, 200, activeExport(g[1]) ?? null)
    }
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/exportaciones$/.exec(p)) && m === 'GET') {
      const dir = path.join(projDir(g[1]), 'salidas'), out = []
      for (const f of await listFiles(dir)) if (f.name.endsWith('.mp4') && !f.name.startsWith('vista-previa') && !f.name.endsWith('.part.mp4'))
        out.push({ name: f.name, size: f.size, fecha: f.mtime, url: `api/files/proyectos/${g[1]}/salidas/${encodeURIComponent(f.name)}` })
      return send(res, 200, out.sort((a, b) => b.fecha.localeCompare(a.fecha)))
    }
    if ((g = /^\/proyectos\/([a-z0-9-]+)\/mostrar$/.exec(p)) && m === 'POST') {
      const { file } = JSON.parse((await readBody(req)) || '{}') as { file?: string }
      const abs = path.join(projDir(g[1]), 'salidas', safeName(file ?? ''))
      if (!isSlug(g[1]) || !file || !(await exists(abs))) return send(res, 404, { error: 'Archivo no encontrado' })
      if (process.platform === 'darwin') await run('open', ['-R', abs]); else if (process.platform === 'win32') await run('explorer', ['/select,', abs]); else await run('xdg-open', [path.dirname(abs)])
      return send(res, 200, { ok: true })
    }
    if ((g = /^\/exportaciones\/(.+)\/cancelar$/.exec(p)) && m === 'POST') { cancelExport(decodeURIComponent(g[1])); return send(res, 200, { ok: true }) }
    if ((g = /^\/exportaciones\/(.+)$/.exec(p)) && m === 'GET') {
      const j = getExport(decodeURIComponent(g[1]))
      return j ? send(res, 200, j) : send(res, 404, { error: 'Exportación no encontrada' })
    }

    if ((g = /^\/trabajos\/(.+)\/cancelar$/.exec(p)) && m === 'POST') {
      const job = jobs.get(decodeURIComponent(g[1]))
      if (!job) return send(res, 404, { error: 'Trabajo no encontrado' })
      await cancelarTrabajo(job)
      return send(res, 200, { ok: true })
    }

    if ((g = /^\/trabajos\/(.+)$/.exec(p)) && m === 'GET') {
      const job = jobs.get(decodeURIComponent(g[1]))
      return job ? send(res, 200, job) : send(res, 404, { error: 'Trabajo no encontrado' })
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)\/referencias$/.exec(p)) && m === 'PUT') {
      const meta = isSlug(g[1]) ? await loadMeta(g[1]) : null
      if (!meta) return send(res, 404, { error: 'Proyecto no encontrado' })
      const { ids } = JSON.parse((await readBody(req)) || '{}') as { ids: string[] }
      meta.referencias = (ids ?? []).map(safeName)
      await writeJson(path.join(projDir(g[1]), 'proyecto.json'), meta)
      return send(res, 200, { referencias: meta.referencias })
    }

    if ((g = /^\/proyectos\/([a-z0-9-]+)\/proyecto$/.exec(p))) {
      const f = path.join(projDir(g[1]), 'proyecto.gojaguar')
      if (!isSlug(g[1])) return send(res, 404, { error: 'No existe' })
      if (m === 'GET') { if (!(await exists(f))) return send(res, 404, { error: 'Aún no hay edición. Usa "Recorta silencios y errores".' }); res.setHeader('Content-Type', 'application/json'); return void res.end(await fsp.readFile(f, 'utf8')) }
      if (m === 'PUT') { await fsp.writeFile(f, await readBody(req)); return send(res, 200, { ok: true }) }
    }

    if (m === 'GET' && p === '/referencias') return send(res, 200, await listReferences())
    if (m === 'PUT' && p === '/referencias') {
      const name = await uniqueName(REFS, safeName(url.searchParams.get('filename') ?? 'referencia.mp4'))
      const size = await saveStream(req, path.join(REFS, name))
      await seleccionarEnProyecto(url.searchParams.get('proyecto'), [name])
      return send(res, 200, { id: name, size, modo: 'copia' })
    }
    if (m === 'POST' && p === '/referencias/elegir') {
      const rutas = await pickFiles(true, 'Elige los videos de referencia')
      const r = await linkReferences(rutas)
      await seleccionarEnProyecto(url.searchParams.get('proyecto'), r.ids)
      return send(res, 200, { agregados: r.agregados, cancelado: rutas.length === 0 })
    }
    if (m === 'POST' && p === '/referencias/enlazar') {
      const { archivos } = JSON.parse((await readBody(req)) || '{}') as { archivos: { name: string; size: number; lastModified: number }[] }
      const rutas: string[] = [], faltan: string[] = []
      for (const a of archivos ?? []) { const r = await locateFile(a.name, a.size, a.lastModified); r ? rutas.push(r) : faltan.push(a.name) }
      const r = await linkReferences(rutas)
      await seleccionarEnProyecto(url.searchParams.get('proyecto'), r.ids)
      return send(res, 200, { enlazados: r.agregados, noEncontrados: faltan })
    }
    if ((g = /^\/referencias\/([^/]+)\/ubicar$/.exec(p)) && m === 'POST') {
      const f = path.join(REFS, `${safeName(decodeURIComponent(g[1]))}.ref.json`)
      const ref = await readJson<RefLink | null>(f, null)
      if (!ref) return send(res, 404, { error: 'No es una referencia enlazada' })
      const [ruta] = await pickFiles(false, `Ubica de nuevo: ${ref.name}`)
      if (ruta) { ref.ruta = ruta; ref.name = path.basename(ruta); ref.size = (await fsp.stat(ruta)).size; await writeJson(f, ref) }
      return send(res, 200, { ok: !!ruta })
    }
    // Borrar de la biblioteca: un enlace se quita sin tocar el original; una copia se borra
    if ((g = /^\/referencias\/(.+)$/.exec(p)) && m === 'DELETE') {
      const id = safeName(decodeURIComponent(g[1]))
      const link = path.join(REFS, `${id}.ref.json`)
      if (await exists(link)) await fsp.rm(link, { force: true }); else await fsp.rm(path.join(REFS, id), { force: true })
      await rmPreview(path.join(REFS, '.previews'), id)
      return send(res, 200, { ok: true })
    }

    if ((g = /^\/files\/(.+)$/.exec(p)) && m === 'GET') return serveFile(req, res, g[1])
    return next()
  } catch (e) {
    return send(res, 500, { error: (e as Error).message })
  }
}
