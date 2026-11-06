// Estira el audio (tempo) conservando el tono, en un hilo aparte.
import { SimpleFilter, SoundTouch, WebAudioBufferSource } from 'soundtouchjs'

self.onmessage = (e: MessageEvent<{ id: string; left: Float32Array; right: Float32Array; tempo: number }>) => {
  const { id, left, right, tempo } = e.data
  const fake = { numberOfChannels: 2, getChannelData: (i: number) => (i ? right : left) }
  const st = new SoundTouch(); st.tempo = tempo
  const filter = new SimpleFilter(new WebAudioBufferSource(fake), st)
  const CH = 16384, tmp = new Float32Array(CH * 2)
  const L: Float32Array[] = [], R: Float32Array[] = []
  let total = 0, lastReport = 0
  for (;;) {
    const n = filter.extract(tmp, CH)
    if (!n) break
    const l = new Float32Array(n), r = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = tmp[i * 2], b = tmp[i * 2 + 1]
      l[i] = Number.isFinite(a) ? a : 0
      r[i] = Number.isFinite(b) ? b : 0
    }
    L.push(l); R.push(r); total += n
    if (total - lastReport > 480000) { lastReport = total; (self as any).postMessage({ id, progress: filter.sourcePosition / left.length }) }
  }
  const outL = new Float32Array(total), outR = new Float32Array(total)
  let o = 0
  for (let k = 0; k < L.length; k++) { outL.set(L[k], o); outR.set(R[k], o); o += L[k].length }
  ;(self as any).postMessage({ id, left: outL, right: outR }, [outL.buffer, outR.buffer])
}
