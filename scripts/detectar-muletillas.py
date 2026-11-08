"""
Muletillas, tartamudeos y palabras repetidas: lista de tramos a quitar para que el video suene fluido.

Whisper NO escribe los "eh", "mmm", "eeee" (los limpia) y los alineadores los pegan a la palabra vecina, así que se buscan DOS veces:
  · en el TEXTO alineado (palabras.json con t0/t1/r1 del alineador):  repeticiones ("que que", "no sé no sé"), arranques en falso, tartamudeos ("co-conocimiento"), muletillas escritas (eh, mm, este, o sea…)
  · en el AUDIO, en lo que queda ENTRE palabras: sonidos con voz (tono estable, sin ser una palabra) = "eeeh" / "mmm", y alargues de la última vocal de una palabra.

Uso:  python3 detectar-muletillas.py <audio.wav 16k mono> <palabras.json> [salida.json]
Salida: [{tipo, a, b, texto, auto, motivo}] en segundos del archivo de origen. `auto: true` = se puede cortar sin duda; `auto: false` = REVISAR (puede ser énfasis o llevar sentido).
Después de cortar: transcribir el audio final y volver a correr scripts/verificar-sincronia.py (ver .claude/skills/guion-viral/SKILL.md, sección "Muletillas").
"""
import json, re, subprocess, sys
import numpy as np

wav, pj = sys.argv[1:3]
salida = sys.argv[3] if len(sys.argv) > 3 else None
P = [x for x in json.load(open(pj)) if re.search(r'\w', x['w'])]
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', wav, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'])
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
SR, HOP, WIN = 16000, 160, 640
DUR = len(x) / SR

# ---------- rasgos por cuadro de 10 ms: energía, "voz" (autocorrelación 75–350 Hz), tono y centroide espectral ----------
n = max(0, (len(x) - WIN) // HOP)
fr = np.lib.stride_tricks.sliding_window_view(x, WIN)[::HOP][:n] * np.hanning(WIN)
db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
piso = np.percentile(db, 10)
ac = np.fft.irfft(np.abs(np.fft.rfft(fr, n=2 * WIN, axis=1)) ** 2, axis=1)[:, :WIN]
ac = ac / (ac[:, :1] + 1e-12)
LO, HI = SR // 350, SR // 75
voz = ac[:, LO:HI].max(axis=1)
f0 = SR / (LO + ac[:, LO:HI].argmax(axis=1))
mag = np.abs(np.fft.rfft(fr, axis=1)); fq = np.fft.rfftfreq(WIN, 1 / SR)
centroide = (mag * fq).sum(axis=1) / (mag.sum(axis=1) + 1e-9)
sonoro = (voz > 0.5) & (db > piso + 9)

norm = lambda w: re.sub(r'[^a-záéíóúñü]', '', w.lower())
W = [norm(p['w']) for p in P]
coma = [bool(re.search(r'[,.;:?!¿¡…]', p['w'])) for p in P]
FUNC = {'que', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'o', 'a', 'en', 'es', 'se', 'me', 'te', 'lo', 'le', 'no', 'con', 'por', 'para', 'mi', 'su', 'si', 'ya', 'pero', 'como', 'esto', 'eso', 'este', 'ese', 'entonces', 'pues', 'sea'}
SOLO_RUIDO = {'eh', 'ehh', 'ehhh', 'em', 'emm', 'mm', 'mmm', 'mmmm', 'hm', 'hmm', 'hmmm', 'ah', 'ahh', 'uh', 'uhh', 'eeh', 'eeeh', 'ee', 'eee', 'eeee', 'ehm', 'ehmm'}
MULETILLAS = {('este',), ('o', 'sea'), ('pues',), ('digamos',), ('osea',), ('bueno',), ('entonces',), ('como', 'que'), ('no', 'sé'), ('verdad',), ('cierto',)}

out = []
def añadir(tipo, a, b, texto, auto, motivo): out.append({'tipo': tipo, 'a': round(float(a), 3), 'b': round(float(b), 3), 'texto': texto, 'auto': auto, 'motivo': motivo})
def pausa_antes(i): return P[i]['t0'] - (P[i - 1].get('r1', P[i - 1]['t1']) if i else 0)
def pausa_despues(i): return (P[i + 1]['t0'] if i + 1 < len(P) else DUR) - P[i].get('r1', P[i]['t1'])

# ---------- 1) texto: sonidos escritos, repeticiones, arranques en falso ----------
usado = set()
for i, w in enumerate(W):
    if w in SOLO_RUIDO or re.fullmatch(r'e+h*m*|m{2,}|h?m{2,}|a+h+|u+h+', w):
        añadir('muletilla', P[i]['t0'] - 0.02, P[i]['t1'], P[i]['w'], True, 'sonido de duda escrito'); usado.add(i)
for L in (3, 2, 1):                                                   # secuencias de L palabras repetidas seguidas: se quita la PRIMERA copia (la última suele ser la completa)
    for i in range(len(W) - 2 * L + 1):
        if any(j in usado for j in range(i, i + 2 * L)): continue
        a, b = W[i:i + L], W[i + L:i + 2 * L]
        if a != b or not all(a): continue
        enfasis = coma[i + L - 1] and len(' '.join(a)) >= 5                # "triste, triste, triste": con coma y palabra de contenido = énfasis, se deja y se avisa
        auto = not enfasis and (L > 1 or a[0] in FUNC or len(a[0]) <= 3 or not coma[i + L - 1])
        añadir('repetida', P[i]['t0'] - 0.02, P[i + L]['t0'] - 0.03, ' '.join(P[j]['w'] for j in range(i, i + L)), auto, 'repite lo que sigue' + (' (¿énfasis?)' if enfasis else ''))
        usado.update(range(i, i + L))
for i in range(len(W) - 1):                                           # tartamudeo escrito: "co-conocimiento", "con- conocimiento": un fragmento que es el inicio de la palabra siguiente
    if i in usado or not W[i] or not W[i + 1]: continue
    frag = re.search(r'-\s*$', P[i]['w']) or (len(W[i]) < len(W[i + 1]) and W[i + 1].startswith(W[i]) and len(W[i]) <= 3 and W[i] not in FUNC and pausa_despues(i) < 0.35)
    if frag: añadir('tartamudeo', P[i]['t0'] - 0.02, P[i + 1]['t0'] - 0.03, P[i]['w'] + ' ' + P[i + 1]['w'], True, 'fragmento que se repite al decir la palabra'); usado.add(i)
for i in range(len(W)):                                               # muletillas con palabras: solo si están aisladas por una pausa (si van pegadas a la frase suelen llevar sentido)
    for m in MULETILLAS:
        if tuple(W[i:i + len(m)]) != m or any(j in usado for j in range(i, i + len(m))): continue
        j = i + len(m) - 1
        aislada = pausa_antes(i) >= 0.15 or pausa_despues(j) >= 0.15
        añadir('muletilla', P[i]['t0'] - 0.02, P[j]['t1'], ' '.join(P[k]['w'] for k in range(i, j + 1)), False, 'muletilla' + (' con pausa al lado' if aislada else ' pegada a la frase: revisar si lleva sentido'))
        usado.update(range(i, j + 1)); break

# ---------- 2) audio: sonidos con voz en lo que queda entre palabras ("eeeh", "mmm") ----------
def corridas(f0_, f1_):
    k0, k1 = max(0, int(f0_ * 100)), min(n, int(f1_ * 100)); runs = []; k = k0
    while k < k1:
        if sonoro[k]:
            j = k
            while j < k1 and (sonoro[j] or (j + 2 < k1 and sonoro[j + 1:j + 3].any())): j += 1
            runs.append((k, j)); k = j
        else: k += 1
    return runs
huecos = [(P[i].get('r1', P[i]['t1']) + 0.03, P[i + 1]['t0'] - 0.03, i, 'entre') for i in range(len(P) - 1)] + [(0.0, P[0]['t0'] - 0.03, -1, 'inicio'), (P[-1].get('r1', P[-1]['t1']) + 0.03, DUR, len(P) - 1, 'final')]
for ha, hb, i, donde in huecos:
    if hb - ha < 0.18: continue
    for k0, k1 in corridas(ha, hb):
        d = (k1 - k0) / 100
        if d < 0.18: continue
        lf = np.log2(np.clip(f0[k0:k1], 60, 400)); estable = float(np.std(lf)) < 0.13           # tono casi plano = vocal sostenida, no una palabra
        nasal = float(np.median(centroide[k0:k1])) < 650
        fuerte = float(db[k0:k1].mean()) - piso
        if not estable or fuerte < 12: continue
        a, b = k0 / 100, k1 / 100
        tipo = 'mmm' if nasal else 'eeeh'
        cerca = ', '.join(P[j]['w'] for j in (i, i + 1) if 0 <= j < len(P))
        añadir('muletilla', a - 0.02, b + 0.02, f'[{tipo}] {d:.2f} s', d >= 0.3 and fuerte >= 16, f'sonido con voz {"nasal" if nasal else "vocal"} entre «{cerca}» (tono estable, no es palabra)')
# alargue de la última vocal: la palabra "se estira" más allá de donde el alineador la cierra (esto…o, pero…o)
for i in range(len(P)):
    r1 = P[i].get('r1', P[i]['t1']); nxt = P[i + 1]['t0'] if i + 1 < len(P) else DUR
    if nxt - r1 < 0.3: continue
    for k0, k1 in corridas(r1, r1 + 0.9):
        if k0 > int((r1 + 0.12) * 100): break
        d = (k1 - k0) / 100
        if d >= 0.3 and np.std(np.log2(np.clip(f0[k0:k1], 60, 400))) < 0.12 and (db[k0:k1].mean() - piso) >= 14 and not any(o['a'] <= k0 / 100 <= o['b'] for o in out if o['tipo'] == 'muletilla'):
            añadir('alargue', r1 + 0.1, k1 / 100, f'«{P[i]["w"]}» alargada {d:.2f} s', False, 'vocal final sostenida: recortar la cola si suena a duda')
        break

out.sort(key=lambda o: o['a'])
for o in out: print(f"{'✓' if o['auto'] else '?'} {o['a']:7.2f}–{o['b']:7.2f}  {o['tipo']:10s} {o['texto']}  · {o['motivo']}")
print(f"{len(out)} candidatos ({sum(o['auto'] for o in out)} seguros, {sum(not o['auto'] for o in out)} por revisar)", file=sys.stderr)
if salida: json.dump(out, open(salida, 'w'), ensure_ascii=False, indent=1)
