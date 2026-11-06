import { parseProject } from '@gojaguar/core'
import { setCanvasSize } from './constants'
import { drawOverlays, preloadOverlayImages } from './overlays'

/**
 * Página que usa la exportación (Chromium sin pantalla): dibuja solo los rótulos (subtítulos y gráficos) sobre fondo transparente,
 * con el MISMO código que el editor, y entrega cada fotograma como PNG. Así lo que ves es lo que sale en el MP4.
 */
export async function bootRender(slug: string, outW: number, outH: number) {
  document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; document.body.style.margin = '0'
  for (const id of ['shell', 'app']) document.getElementById(id)?.remove()
  const project = parseProject(await (await fetch(`/api/proyectos/${slug}/proyecto`)).text())
  setCanvasSize(project.format)
  const { W, H } = await import('./constants')
  await Promise.all(['900', '800', '700', '600'].map(w => document.fonts.load(`${w} 40px Figtree`)))
  await preloadOverlayImages(project)
  const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH; document.body.append(cv)
  const ctx = cv.getContext('2d')!
  const tr = project.tracks
  const shown = tr?.subtitle?.hidden || tr?.graphic?.hidden ? { ...project, layers: project.layers.filter(l => !tr?.[l.type]?.hidden) } : project
  ;(window as any).__draw = (t: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, outW, outH)
    ctx.setTransform(outW / W, 0, 0, outH / H, 0, 0)
    drawOverlays(ctx, shown, t, null)
    return cv.toDataURL('image/png')
  }
  ;(window as any).__ready = true
}
