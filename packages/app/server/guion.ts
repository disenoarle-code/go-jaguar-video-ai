/**
 * Revisión de guion: párrafos con sus palabras (de Whisper), muletillas marcadas y aplicación del guion al edit.
 * Se guarda en biblioteca/proyectos/<slug>/analisis/guion.json. Sin navegador ni ffmpeg: lógica pura + archivos.
 */

/** Colchón de audio en TODOS los cortes del proyecto (no recortar palabras al hablar). */
export const PADDING = 0.03
/** Pausa entre palabras de un mismo tramo que se corta (silencio). */
export const PAUSA_CORTE = 0.45

export interface Palabra { i: number; t0: number; t1: number; w: string; del?: boolean; mul?: boolean }
export interface Parrafo { id: string; f: string; words: Palabra[] }
export interface Guion { estado: 'revision'; parrafos: Parrafo[] }

const norm = (w: string) => w.toLowerCase().replace(/[^a-záéíóúñü]/g, '')
const RUIDO = /^(e+h*m*|h?m{2,}|a+h+|u+h+|ehm+)$/

/** Marca muletillas escritas y repeticiones inmediatas ("que que", "no sé no sé"): se quitan de entrada, el usuario puede restaurarlas. */
export function marcarMuletillas(ws: Palabra[]) {
  const W = ws.map(x => norm(x.w))
  const usado = new Set<number>()
  W.forEach((w, i) => { if (w && RUIDO.test(w)) { ws[i].mul = ws[i].del = true; usado.add(i) } })
  for (const L of [2, 1]) {
    for (let i = 0; i + 2 * L <= W.length; i++) {
      if ([...Array(2 * L).keys()].some(k => usado.has(i + k))) continue
      const a = W.slice(i, i + L), b = W.slice(i + L, i + 2 * L)
      if (!a.every(Boolean) || a.join(' ') !== b.join(' ')) continue
      if (/[,.;:?!…]$/.test(ws[i + L - 1].w)) continue   // con puntuación puede ser énfasis: se deja
      for (let k = 0; k < L; k++) { ws[i + k].mul = ws[i + k].del = true; usado.add(i + k) }   // se quita la primera copia
    }
  }
}

/** Parte las palabras de un video en párrafos: por pausas largas o fin de frase cuando ya hay bastante texto. */
export function armarParrafos(f: string, words: { i: number; t0: number; t1: number; w: string }[]): Parrafo[] {
  const out: Parrafo[] = []; let cur: Palabra[] = []
  const cerrar = () => { if (cur.length) { marcarMuletillas(cur); out.push({ id: `${f}-${cur[0].i}`, f, words: cur }); cur = [] } }
  words.forEach((w, k) => {
    cur.push({ i: w.i, t0: w.t0, t1: w.t1, w: w.w })
    const nx = words[k + 1]
    const gap = nx ? nx.t0 - w.t1 : 9
    if (gap >= 0.8 || (/[.?!]$/.test(w.w) && cur.length >= 18) || cur.length >= 45) cerrar()
  })
  cerrar()
  return out
}

/** Guion en texto plano para que Claude lo lea con pocos tokens (sin tiempos por palabra): una línea por sección, solo lo que NO se quitó, en el orden final. */
export function guionTexto(g: Guion): string {
  const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`
  return g.parrafos.map((p, n) => ({ n, p, txt: p.words.filter(w => !w.del).map(w => w.w).join(' ') })).filter(x => x.txt)
    .map(x => `S${x.n + 1} ${x.p.f} ${tc(x.p.words[0].t0)}-${tc(x.p.words[x.p.words.length - 1].t1)} ${x.txt}`).join('\n')
}

export interface Tramo { f: string; src_in: number; src_out: number }

/** Del guion (orden y palabras borradas) a tramos de clip: padding de 30 ms, se corta donde hay pausa larga o palabras borradas. */
export function tramosDelGuion(g: Guion, duracion: (f: string) => number): Tramo[] {
  const out: Tramo[] = []
  for (const p of g.parrafos) {
    const dur = duracion(p.f)
    let run: Palabra[] = []
    const cerrar = () => {
      if (!run.length) return
      const a = Math.max(0, run[0].t0 - PADDING), b = Math.min(dur, run[run.length - 1].t1 + PADDING)
      const prev = out[out.length - 1]
      if (prev && prev.f === p.f && a <= prev.src_out && b >= prev.src_in) prev.src_out = Math.max(prev.src_out, b)   // se tocan: un solo clip
      else if (b - a > 0.05) out.push({ f: p.f, src_in: +a.toFixed(3), src_out: +b.toFixed(3) })
      run = []
    }
    for (const w of p.words) {
      if (w.del) { cerrar(); continue }
      if (run.length && w.t0 - run[run.length - 1].t1 >= PAUSA_CORTE) cerrar()
      run.push(w)
    }
    cerrar()
  }
  return out
}
