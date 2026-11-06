import { duration, type Store } from '@gojaguar/core'
import type { Player } from './player'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const pct = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))]

/**
 * Mide lo que el plan fija como presupuesto: scrub, reproducción y memoria.
 * Debe correr con la pestaña visible (si está oculta, el navegador frena los frames).
 * Uso desde la consola: `await editor.bench()`
 */
export async function runBench(player: Player, store: Store) {
  const dur = duration(store.project)
  player.pause(); player.hover = null

  // 1) Scrub: tiempo desde que el cursor pide un tiempo hasta que ese frame se ve.
  const scrub: number[] = []
  for (let i = 0; i < 60; i++) {
    player.hover = Math.random() * (dur - 1); player.dirty = true
    const before = player.layerKey
    const t0 = performance.now()
    while (player.layerKey === before && performance.now() - t0 < 1000) await wait(1)
    scrub.push(performance.now() - t0)
  }
  player.hover = null
  scrub.sort((a, b) => a - b)

  // 2) Reproducción: frames distintos mostrados y avance del reloj en 5 s.
  player.seek(Math.min(20, dur / 4)); const start = player.playhead
  await player.play()
  const t0 = performance.now()
  let frames = 0, last = '', stalls = 0, lastChange = t0
  while (performance.now() - t0 < 5000) {
    if (player.layerKey !== last) {
      frames++; last = player.layerKey
      const now = performance.now(); if (now - lastChange > 80) stalls++; lastChange = now
    }
    await wait(4)
  }
  const clock = player.time() - start
  const canvasFps = player.fps.shown
  player.pause()

  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return {
    fecha: new Date().toISOString(),
    clips: store.project.clips.length,
    duracion_s: +dur.toFixed(1),
    scrub_ms: { mediana: +pct(scrub, 0.5).toFixed(1), p90: +pct(scrub, 0.9).toFixed(1), max: +scrub[scrub.length - 1].toFixed(1) },
    reproduccion: { frames_distintos_5s: frames, reloj_avanzo_s: +clock.toFixed(2), pausas_mayores_80ms: stalls, fps_canvas: canvasFps },
    memoria_js_mb: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null,
  }
}
