/**
 * Exportar a MP4: renderiza la edición actual (.gojaguar) con ffmpeg.
 * Incluye: pista principal con zoom/transiciones por clip, videos superpuestos (posición, tamaño, opacidad, esquinas),
 * audio de los clips, pistas de audio extra y la música. Las fórmulas de movimiento son las mismas de
 * packages/core/src/fx.ts (lo que se ve en el editor es lo que sale en el archivo).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { renderRotulos } from './rotulos'
import { layout, mainDuration, overlayDur, duration, parseProject, type Clip, type Project, type Transition } from '@gojaguar/core'

export interface ExportOpts { resolucion: 'original' | '720' | '480'; calidad: 'rapida' | 'buena' | 'maxima'; nombre?: string }
export interface ExportJob {
  id: string; slug: string; status: 'running' | 'done' | 'error' | 'cancelado'; pct: number
  detail?: string; error?: string; file?: string; url?: string; size?: number; opts: ExportOpts; cancelada?: boolean
}

const jobs = new Map<string, ExportJob>()
const procs = new Map<string, ChildProcess>()
export const getExport = (id: string) => jobs.get(id)
export const activeExport = (slug: string) => [...jobs.values()].find(j => j.slug === slug && j.status === 'running')

const QUALITY: Record<ExportOpts['calidad'], string[]> = {
  rapida: ['-preset', 'veryfast', '-crf', '23'],
  buena: ['-preset', 'medium', '-crf', '19'],
  maxima: ['-preset', 'slow', '-crf', '16'],
}
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const atempoChain = (v: number) => { const f: number[] = []; let x = v; while (x > 2) { f.push(2); x /= 2 } while (x < 0.5) { f.push(0.5); x /= 0.5 } f.push(x); return f.map(n => `atempo=${n.toFixed(4)}`).join(',') }
const num = (n: number) => String(Math.round(n * 1e4) / 1e4)

function probeAudio(file: string): Promise<boolean> {
  return new Promise(resolve => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file])
    let out = ''; p.stdout.on('data', d => { out += d }); p.on('error', () => resolve(false)); p.on('close', () => resolve(out.trim() === 'audio'))
  })
}

/**
 * Zoom + transiciones de un clip como expresiones de zoompan/eq. Misma fórmula que fxAt del core (packages/core/src/fx.ts):
 * la transición del corte se reparte mitad en la salida del clip anterior y mitad en la entrada de este.
 */
function fxExpr(clip: Clip, next: Clip | undefined, D: number, fps: number) {
  const t = `on/${fps}`, tn = `n/${fps}`        // zoompan cuenta fotogramas con "on"; eq con "n"
  const ease = (u: string) => `pow(max(0,1-(${u})),2)`
  const zs: string[] = [], ss: string[] = [], fs: string[] = []
  const zm = clip.zoom
  if (zm) {
    if (zm.kind === 'push') zs.push(`${num(zm.amount)}*${t}/${num(D)}`)
    else if (zm.kind === 'pull') zs.push(`${num(zm.amount)}*(1-${t}/${num(D)})`)
    else zs.push(`${num(zm.amount)}*${ease(`${t}/${num(zm.duration ?? 0.35)}`)}+0.05*${t}/${num(D)}`)
  }
  const side = (tr: Transition | undefined, kind: 'in' | 'out') => {
    if (!tr) return
    const h = num(tr.duration / 2), k = num(tr.intensity)
    const e = (tv: string) => ease(kind === 'in' ? `${tv}/${h}` : `(${num(D)}-${tv})/${h}`)
    if (tr.kind === 'slide') { zs.push(`${num(0.22 * tr.intensity)}*${e(t)}`); ss.push(`${kind === 'in' ? 1 : -1}*${tr.dir ?? 1}*${e(t)}`) }
    else if (tr.kind === 'flash') fs.push(`${num(0.9 * tr.intensity)}*${e(tn)}`)
    else fs.push(`-${k}*${e(tn)}`)
  }
  side(clip.transition, 'in'); side(next?.transition, 'out')
  return {
    z: zs.length ? `1+${zs.join('+')}` : '1',
    x: 'iw/2-(iw/zoom/2)' + (ss.length ? `+(iw-iw/zoom)/2*(${ss.join('+')})` : ''),
    flash: fs.length ? `clip(${fs.join('+')},-1,1)` : '',
  }
}

export async function buildExport(project: Project, root: string, opts: ExportOpts, rot?: { dir: string; t0: number; t1: number }) {
  const fps = project.format.fps || 30
  const scale = opts.resolucion === 'original' ? 1 : (opts.resolucion === '720' ? 720 : 480) / Math.min(project.format.width, project.format.height)
  const W = even(project.format.width * Math.min(scale, 1)), H = even(project.format.height * Math.min(scale, 1))
  const total = duration(project)
  if (total <= 0) throw new Error('La edición está vacía')
  const assets = new Map(project.assets.map(a => [a.id, a]))
  const srcOf = async (id: string) => {
    const a = assets.get(id)!
    for (const f of [a.original, path.join(root, decodeURIComponent((a.proxy ?? '').replace(/^api\/files\//, '')))]) { if (f && path.isAbsolute(f) && await fsp.stat(f).then(s => s.isFile()).catch(() => false)) return f }
    throw new Error(`No encuentro el archivo "${a.name}". Ubícalo de nuevo en el Material.`)
  }
  const inputs: string[][] = []
  const audioCache = new Map<string, boolean>()
  const hasAudio = async (f: string) => { if (!audioCache.has(f)) audioCache.set(f, await probeAudio(f)); return audioCache.get(f)! }
  const addInput = (ss: number, len: number, file: string) => { inputs.push(['-ss', num(ss), '-t', num(len), '-i', file]); return inputs.length - 1 }

  const ts = (k: string) => project.tracks?.[k] ?? {}
  const vf: string[] = [], audio: string[] = []
  const placed = layout(project)
  const A_FMT = 'aformat=sample_rates=44100:channel_layouts=stereo'

  // 1) pista principal
  const vlabels: string[] = []
  for (const [i, pl] of placed.entries()) {
    const c = pl.clip, D = pl.end - pl.start, file = await srcOf(c.assetId)
    const k = addInput(c.srcIn, (c.srcOut - c.srcIn) + 0.3, file)
    const fx = fxExpr(c, placed[i + 1]?.clip, D, fps)
    if (!ts('main').hidden) {
    const eq = fx.flash ? `,eq=brightness='${fx.flash}':eval=frame` : ''
    vf.push(`[${k}:v]setpts=(PTS-STARTPTS)/${num(c.speed)},fps=${fps},scale=${2 * W}:${2 * H}:force_original_aspect_ratio=decrease,pad=${2 * W}:${2 * H}:(ow-iw)/2:(oh-ih)/2:black,`
      + `zoompan=z='${fx.z}':x='${fx.x}':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}${eq},trim=duration=${num(D)},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v${i}]`)
    vlabels.push(`[v${i}]`)
    }
    if (!ts('main').muted && c.volume > 0 && await hasAudio(file)) audio.push(`[${k}:a]asetpts=PTS-STARTPTS,${A_FMT},${atempoChain(c.speed)},volume=${num(c.volume)},atrim=0:${num(D)},adelay=${Math.round(pl.start * 1000)}:all=1[ac${i}]`)
  }
  vf.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${num(total)}[base]`)
  let cur = 'base'
  if (vlabels.length) { vf.push(`${vlabels.join('')}concat=n=${vlabels.length}:v=1:a=0[main]`); vf.push(`[base][main]overlay=0:0:eof_action=pass[b0]`); cur = 'b0' }

  // 2) clips superpuestos: video encima (pista baja primero) y audio
  const ovs = [...(project.overlays ?? [])].sort((a, b) => a.track - b.track || a.start - b.start)
  for (const [j, o] of ovs.entries()) {
    const file = await srcOf(o.assetId), D = overlayDur(o)
    const k = addInput(o.srcIn, (o.srcOut - o.srcIn) + 0.3, file)
    if (o.kind === 'video' && o.blend === 'screen' && !ts('v' + o.track).hidden) {
      // luz (screen): cubre todo el cuadro; ambos lados en el MISMO formato (gbrp) o el color sale desviado (magenta)
      const st = num(o.start), en = num(o.start + D), kb = `kb${j}`
      vf.push(`[${k}:v]setpts=(PTS-STARTPTS)/${num(o.speed)}+${st}/TB,fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=gbrp[sc${j}]`)
      vf.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${num(duration(project))},format=gbrp[${kb}]`)
      vf.push(`[${kb}][sc${j}]overlay=0:0:eof_action=pass:enable='between(t,${st},${en})'[kl${j}]`)
      vf.push(`[${cur}]format=gbrp[cf${j}]`)
      vf.push(`[cf${j}][kl${j}]blend=all_mode=screen:all_opacity=${num(o.transform.opacity)}[b${j + 1}]`)
      cur = `b${j + 1}`
    } else if (o.kind === 'video' && !ts('v' + o.track).hidden) {
      const R = `(min(W,H)*0.06)`
      const round = `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(abs(X-W/2)-(W/2-${R}),0)*gt(abs(Y-H/2)-(H/2-${R}),0)*gt(hypot(abs(X-W/2)-(W/2-${R}),abs(Y-H/2)-(H/2-${R})),${R}),0,255)'`
      vf.push(`[${k}:v]setpts=(PTS-STARTPTS)/${num(o.speed)}+${num(o.start)}/TB,fps=${fps},scale=w='trunc(min(${W}/iw,${H}/ih)*iw*${num(o.transform.scale)}/2)*2':h=-2,format=rgba,${round},colorchannelmixer=aa=${num(o.transform.opacity)}[ov${j}]`)
      vf.push(`[${cur}][ov${j}]overlay=x='${num(W * o.transform.x)}-w/2':y='${num(H * o.transform.y)}-h/2':eof_action=pass:enable='between(t,${num(o.start)},${num(o.start + D)})'[b${j + 1}]`)
      cur = `b${j + 1}`
    }
    if (!ts((o.kind === 'video' ? 'v' : 'a') + o.track).muted && o.volume > 0 && await hasAudio(file)) audio.push(`[${k}:a]asetpts=PTS-STARTPTS,${A_FMT},${atempoChain(o.speed)},volume=${num(o.volume)},atrim=0:${num(D)},adelay=${Math.round(o.start * 1000)}:all=1[ao${j}]`)
  }

  // 3) música
  if (project.music && assets.has(project.music.assetId) && project.music.volume > 0 && !ts('music').muted) {
    const m = project.music, file = await srcOf(m.assetId)
    const k = addInput(m.srcIn, total + 0.3, file)
    const fade = m.fadeOut > 0 ? `,afade=t=out:st=${num(Math.max(0, total - m.fadeOut))}:d=${num(m.fadeOut)}` : ''
    audio.push(`[${k}:a]asetpts=PTS-STARTPTS,${A_FMT},volume=${num(m.volume)}${fade},atrim=0:${num(total)}[am]`)
  }

  // 4) rótulos (subtítulos y gráficos): secuencia de PNG con transparencia dibujada por el editor, encima de todo
  if (rot) {
    inputs.push(['-framerate', String(fps), '-i', path.join(rot.dir, '%05d.png')]); const k = inputs.length - 1
    vf.push(`[${k}:v]setpts=PTS-STARTPTS+${num(rot.t0)}/TB,format=rgba[txt]`)
    vf.push(`[${cur}][txt]overlay=0:0:eof_action=pass:enable='between(t,${num(rot.t0)},${num(rot.t1)})'[btxt]`); cur = 'btxt'
  }

  vf.push(`[${cur}]null[v]`)
  const labels = audio.map(l => /\[(a[a-z]+\d*)\]$/.exec(l)![1])
  let hasA = false
  if (labels.length) {
    hasA = true
    vf.push(...audio)
    vf.push(`${labels.map(l => `[${l}]`).join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,atrim=0:${num(total)},alimiter=limit=0.97[a]`)
  }
  return { inputs, filter: vf.join(';\n'), hasA, W, H, fps, total, mainTotal: mainDuration(project) }
}

/** Lanza la exportación en segundo plano. */
export interface Exportado { slug: string; name: string; ruta: string; size: number; fecha: string }

/** Mueve el archivo (rename; si es otro disco, copia y borra). */
async function mover(src: string, dst: string) {
  try { await fsp.rename(src, dst) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e; await fsp.copyFile(src, dst); await fsp.rm(src, { force: true }) }
}
async function nombreLibre(dir: string, name: string) {
  const ext = path.extname(name), base = path.basename(name, ext)
  for (let i = 1; ; i++) { const f = path.join(dir, i === 1 ? name : `${base} (${i})${ext}`); if (!(await fsp.stat(f).then(() => true).catch(() => false))) return f }
}

export async function startExport(slug: string, projectFile: string, outDir: string, root: string, opts: ExportOpts, origin: string, carpeta: string, registrar: (e: Exportado) => Promise<void>): Promise<ExportJob> {
  const running = activeExport(slug); if (running) return running
  const job: ExportJob = { id: `${slug}-${Date.now()}`, slug, status: 'running', pct: 0, opts, detail: 'Preparando…' }
  jobs.set(job.id, job)
  void (async () => {
    try {
      const raw = parseProject(await fsp.readFile(projectFile, 'utf8'))     // también abre y migra proyectos de versiones anteriores
      // rótulos visibles (no ocultos): se dibujan primero con Chromium sin pantalla
      const tr = raw.tracks, texts = raw.layers.filter(l => (l.type === 'subtitle' || l.type === 'graphic') && !tr?.[l.type]?.hidden)
      const total = duration(raw)
      let rot: { dir: string; t0: number; t1: number } | undefined
      const sc = opts.resolucion === 'original' ? 1 : (opts.resolucion === '720' ? 720 : 480) / Math.min(raw.format.width, raw.format.height)
      const ow = Math.max(2, Math.round(raw.format.width * Math.min(sc, 1) / 2) * 2), oh = Math.max(2, Math.round(raw.format.height * Math.min(sc, 1) / 2) * 2)
      if (texts.length) {
        job.detail = 'Dibujando rótulos…'
        const t0 = Math.max(0, Math.min(...texts.map(l => l.start))), t1 = Math.min(total, Math.max(...texts.map(l => l.end)))
        const dir = path.join(outDir, '.rotulos'); await fsp.rm(dir, { recursive: true, force: true })
        await renderRotulos({ origin, slug, w: ow, h: oh, fps: raw.format.fps || 30, t0, t1, outDir: dir, cancelled: () => !!job.cancelada, onProgress: p => { job.pct = p * 0.25 } })
        rot = { dir, t0, t1 }
      }
      const b = await buildExport(raw, root, opts, rot)
      await fsp.mkdir(outDir, { recursive: true })
      const safe = (opts.nombre ?? slug).normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || slug
      const name = `${safe}-${b.W}x${b.H}.mp4`, out = path.join(outDir, name), tmp = out + '.part.mp4', script = path.join(outDir, '.exportar.filter.txt')
      await fsp.writeFile(script, b.filter)
      const args = ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-y', ...b.inputs.flat(), '-/filter_complex', script, '-map', '[v]', ...(b.hasA ? ['-map', '[a]'] : []),
        '-c:v', 'libx264', ...QUALITY[opts.calidad], '-pix_fmt', 'yuv420p', '-r', String(b.fps), ...(b.hasA ? ['-c:a', 'aac', '-b:a', '192k'] : []), '-movflags', '+faststart', '-f', 'mp4', tmp]
      job.detail = 'Renderizando…'
      await new Promise<void>((resolve, reject) => {
        const p = spawn('ffmpeg', args); procs.set(job.id, p)
        let err = ''
        p.stdout.on('data', d => { const m = /out_time_us=(\d+)/g; let x, last = 0; const s = String(d); while ((x = m.exec(s))) last = Number(x[1]); if (last) job.pct = Math.min(0.99, (rot ? 0.25 : 0) + (1 - (rot ? 0.25 : 0)) * (last / 1e6 / b.total)) })
        p.stderr.on('data', d => { err += d })
        p.on('error', reject)
        p.on('close', code => code === 0 ? resolve() : reject(new Error(job.cancelada ? 'Cancelado' : 'ffmpeg falló: ' + err.slice(-400))))
      })
      await fsp.rm(script, { force: true }); await fsp.rm(path.join(outDir, '.rotulos'), { recursive: true, force: true })
      await fsp.rename(tmp, out)
      const dest = await nombreLibre(carpeta, name)          // el video final queda en la carpeta que eligió el usuario, no escondido en la biblioteca
      await mover(out, dest)
      job.file = dest; job.size = (await fsp.stat(dest)).size; job.url = `api/exportado?ruta=${encodeURIComponent(dest)}`; job.pct = 1; job.status = 'done'; job.detail = undefined
      await registrar({ slug, name: path.basename(dest), ruta: dest, size: job.size, fecha: new Date().toISOString() })
    } catch (e) {
      await fsp.rm(path.join(outDir, '.exportar.filter.txt'), { force: true }).catch(() => {}); await fsp.rm(path.join(outDir, '.rotulos'), { recursive: true, force: true }).catch(() => {})
      for (const f of await fsp.readdir(outDir).catch(() => [] as string[])) if (f.endsWith('.part.mp4')) await fsp.rm(path.join(outDir, f), { force: true })
      if (job.cancelada) { job.status = 'cancelado'; job.error = 'Exportación cancelada' } else { job.status = 'error'; job.error = (e as Error).message }
    } finally { procs.delete(job.id) }
  })()
  return job
}

export function cancelExport(id: string) {
  const j = jobs.get(id); if (!j || j.status !== 'running') return
  j.cancelada = true; procs.get(id)?.kill('SIGKILL')
}
