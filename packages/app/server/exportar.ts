/**
 * Exportar a MP4: renderiza la edición actual (.gojaguar) con ffmpeg.
 * Incluye: pista principal con zoom/transiciones por clip, videos superpuestos (posición, tamaño, opacidad, esquinas),
 * audio de los clips, pistas de audio extra y la música. Las fórmulas de movimiento son las mismas de
 * packages/core/src/fx.ts (lo que se ve en el editor es lo que sale en el archivo).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { layout, mainDuration, overlayDur, duration, type Project } from '@gojaguar/core'

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

/** Efecto de un clip como expresiones de zoompan (misma fórmula que fxAt del core). */
function fxExpr(fx: string | undefined, dir: number, D: number, fps: number, last: boolean) {
  const t = `on/${fps}`
  const ease = (d: number) => `pow(max(0,1-${t}/${d}),2)`
  let z = '1', x = 'iw/2-(iw/zoom/2)', flash = 0
  if (fx === 'push') z = `1+${last ? 0.22 : 0.14}*${t}/${num(D)}`
  else if (fx === 'punch') z = `1+0.22*${ease(0.35)}+0.05*${t}/${num(D)}`
  else if (fx === 'slide') { z = `1.22+0.06*${t}/${num(D)}`; x = `iw/2-(iw/zoom/2)+${dir}*(iw-iw/zoom)/2*${ease(0.22)}` }
  else if (fx === 'punchflash') { z = `1+0.2*${ease(0.3)}+0.05*${t}/${num(D)}`; flash = 0.55 }
  else if (fx === 'dropflash') { z = `1+0.35*${ease(0.5)}+0.06*${t}/${num(D)}`; flash = 0.9 }
  return { z, x, flash }
}

export async function buildExport(project: Project, root: string, opts: ExportOpts) {
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

  const vf: string[] = [], audio: string[] = []
  const placed = layout(project)
  const A_FMT = 'aformat=sample_rates=44100:channel_layouts=stereo'

  // 1) pista principal
  const vlabels: string[] = []
  for (const [i, pl] of placed.entries()) {
    const c = pl.clip, D = pl.end - pl.start, file = await srcOf(c.assetId)
    const k = addInput(c.srcIn, (c.srcOut - c.srcIn) + 0.3, file)
    const fx = fxExpr(c.fx, c.fxDir ?? 1, D, fps, i === placed.length - 1)
    const eq = fx.flash ? `,eq=brightness='${fx.flash}*pow(max(0,1-n/${fps}/0.15),2)':eval=frame` : ''
    vf.push(`[${k}:v]setpts=(PTS-STARTPTS)/${num(c.speed)},fps=${fps},scale=${2 * W}:${2 * H}:force_original_aspect_ratio=decrease,pad=${2 * W}:${2 * H}:(ow-iw)/2:(oh-ih)/2:black,`
      + `zoompan=z='${fx.z}':x='${fx.x}':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}${eq},trim=duration=${num(D)},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v${i}]`)
    vlabels.push(`[v${i}]`)
    if (c.volume > 0 && await hasAudio(file)) audio.push(`[${k}:a]asetpts=PTS-STARTPTS,${A_FMT},${atempoChain(c.speed)},volume=${num(c.volume)},atrim=0:${num(D)},adelay=${Math.round(pl.start * 1000)}:all=1[ac${i}]`)
  }
  vf.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${num(total)}[base]`)
  let cur = 'base'
  if (vlabels.length) { vf.push(`${vlabels.join('')}concat=n=${vlabels.length}:v=1:a=0[main]`); vf.push(`[base][main]overlay=0:0:eof_action=pass[b0]`); cur = 'b0' }

  // 2) clips superpuestos: video encima (pista baja primero) y audio
  const ovs = [...(project.overlays ?? [])].sort((a, b) => a.track - b.track || a.start - b.start)
  for (const [j, o] of ovs.entries()) {
    const file = await srcOf(o.assetId), D = overlayDur(o)
    const k = addInput(o.srcIn, (o.srcOut - o.srcIn) + 0.3, file)
    if (o.kind === 'video') {
      const R = `(min(W,H)*0.06)`
      const round = `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(abs(X-W/2)-(W/2-${R}),0)*gt(abs(Y-H/2)-(H/2-${R}),0)*gt(hypot(abs(X-W/2)-(W/2-${R}),abs(Y-H/2)-(H/2-${R})),${R}),0,255)'`
      vf.push(`[${k}:v]setpts=(PTS-STARTPTS)/${num(o.speed)}+${num(o.start)}/TB,fps=${fps},scale=w='trunc(min(${W}/iw,${H}/ih)*iw*${num(o.transform.scale)}/2)*2':h=-2,format=rgba,${round},colorchannelmixer=aa=${num(o.transform.opacity)}[ov${j}]`)
      vf.push(`[${cur}][ov${j}]overlay=x='${num(W * o.transform.x)}-w/2':y='${num(H * o.transform.y)}-h/2':eof_action=pass:enable='between(t,${num(o.start)},${num(o.start + D)})'[b${j + 1}]`)
      cur = `b${j + 1}`
    }
    if (o.volume > 0 && await hasAudio(file)) audio.push(`[${k}:a]asetpts=PTS-STARTPTS,${A_FMT},${atempoChain(o.speed)},volume=${num(o.volume)},atrim=0:${num(D)},adelay=${Math.round(o.start * 1000)}:all=1[ao${j}]`)
  }

  // 3) música
  if (project.music && assets.has(project.music.assetId) && project.music.volume > 0) {
    const m = project.music, file = await srcOf(m.assetId)
    const k = addInput(m.srcIn, total + 0.3, file)
    const fade = m.fadeOut > 0 ? `,afade=t=out:st=${num(Math.max(0, total - m.fadeOut))}:d=${num(m.fadeOut)}` : ''
    audio.push(`[${k}:a]asetpts=PTS-STARTPTS,${A_FMT},volume=${num(m.volume)}${fade},atrim=0:${num(total)}[am]`)
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
export async function startExport(slug: string, projectFile: string, outDir: string, root: string, opts: ExportOpts): Promise<ExportJob> {
  const running = activeExport(slug); if (running) return running
  const job: ExportJob = { id: `${slug}-${Date.now()}`, slug, status: 'running', pct: 0, opts, detail: 'Preparando…' }
  jobs.set(job.id, job)
  void (async () => {
    try {
      const raw = JSON.parse(await fsp.readFile(projectFile, 'utf8')).project as Project
      const b = await buildExport(raw, root, opts)
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
        p.stdout.on('data', d => { const m = /out_time_us=(\d+)/g; let x, last = 0; const s = String(d); while ((x = m.exec(s))) last = Number(x[1]); if (last) job.pct = Math.min(0.99, last / 1e6 / b.total) })
        p.stderr.on('data', d => { err += d })
        p.on('error', reject)
        p.on('close', code => code === 0 ? resolve() : reject(new Error(job.cancelada ? 'Cancelado' : 'ffmpeg falló: ' + err.slice(-400))))
      })
      await fsp.rm(script, { force: true })
      await fsp.rename(tmp, out)
      job.file = out; job.size = (await fsp.stat(out)).size; job.url = `api/files/proyectos/${slug}/salidas/${encodeURIComponent(name)}`; job.pct = 1; job.status = 'done'; job.detail = undefined
    } catch (e) {
      await fsp.rm(path.join(outDir, '.exportar.filter.txt'), { force: true }).catch(() => {})
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
