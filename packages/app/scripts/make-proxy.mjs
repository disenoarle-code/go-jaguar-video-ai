// Uso: npm run proxy -- ../media/originales/mi_video.mp4
// Genera el proxy (todos los frames son keyframes => scrubbing instantáneo)
// y lo registra en media/manifest.json
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = resolve(here, '../../../media')
const input = process.argv[2]
if (!input) { console.error('Falta el archivo de video'); process.exit(1) }

const src = resolve(input)
const name = basename(src, extname(src))
const proxyRel = `proxies/${name}.proxy.mp4`
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', src]).toString())
const [n, d] = probe.streams[0].r_frame_rate.split('/').map(Number)
const fps = Math.round((n / d) * 1000) / 1000
const { width, height } = probe.streams[0]
const duration = Number(probe.format.duration)

const hw = process.env.HWACCEL ? ['-hwaccel', process.env.HWACCEL] : []
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-stats', '-y', ...hw, '-i', src,
  '-vf', 'scale=640:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-g', '1',
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
  resolve(mediaDir, proxyRel)], { stdio: 'inherit' })

const mp = resolve(mediaDir, 'manifest.json')
const manifest = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : { assets: [] }
const rel = src.startsWith(mediaDir) ? src.slice(mediaDir.length + 1) : src
manifest.assets = manifest.assets.filter(a => a.name !== name)
manifest.assets.push({ id: 'a' + (manifest.assets.length + 1), name, proxy: proxyRel, original: rel, duration, fps, width, height })
writeFileSync(mp, JSON.stringify(manifest, null, 2))
console.log(`OK: ${name} (${duration.toFixed(1)}s, ${fps}fps)`)
