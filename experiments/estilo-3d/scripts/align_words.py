"""Tiempos por palabra: la voz se detecta por energía (islas de habla) y las palabras de Whisper se
reparten dentro de ellas según su duración hablada estimada. Más fiable que los tiempos sueltos de Whisper."""
import json, re, subprocess
d = json.load(open('work/seg_words.json'))['transcription']
words = [s['text'].strip() for s in d if s['text'].strip()]
DUR = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1','work/seg.wav']))
out = subprocess.run(['ffmpeg','-hide_banner','-nostats','-i','work/seg.wav','-af','silencedetect=noise=-33dB:d=0.07','-f','null','-'],capture_output=True,text=True).stderr
sil, st = [], None
for l in out.split('\n'):
    m = re.search(r'silence_start: ([\d.]+)', l)
    if m: st = float(m.group(1))
    m = re.search(r'silence_end: ([\d.]+)', l)
    if m and st is not None: sil.append((st, float(m.group(1)))); st = None
if st is not None: sil.append((st, DUR))
isl, cur = [], 0.0
for a, b in sil:
    if a - cur > 0.05: isl.append((cur, a))
    cur = b
if DUR - cur > 0.05: isl.append((cur, DUR))
spoken = {'60':'sesenta','50':'cincuenta','45':'cuarenta y cinco'}
def weight(w):
    w2 = re.sub(r'[^\wáéíóúñ]', '', w.lower()); w2 = spoken.get(w2, w2)
    return max(2, len(w2)) + 1.5          # +1.5: coarticulación / vocal de enlace
W = [weight(w) for w in words]
total_speech = sum(b - a for a, b in isl)
tot_w = sum(W)
# tiempo de habla acumulado -> tiempo real
def to_real(s):
    acc = 0.0
    for a, b in isl:
        if s <= acc + (b - a) + 1e-9: return a + (s - acc)
        acc += b - a
    return isl[-1][1]
res, c = [], 0.0
for w, wt in zip(words, W):
    s0 = c / tot_w * total_speech; s1 = (c + wt) / tot_w * total_speech
    res.append({'w': w, 't0': round(to_real(s0), 3), 't1': round(to_real(s1 - 1e-6), 3)}); c += wt
json.dump(res, open('public/words.json', 'w'), ensure_ascii=False)
print(f"{len(isl)} islas de habla, {total_speech:.1f}s de {DUR:.1f}s")
print(' '.join(f"{r['w']}[{r['t0']:.2f}]" for r in res))
