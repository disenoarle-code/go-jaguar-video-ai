"""
Tiempos por palabra fiables para subtítulos karaoke. Whisper (-ml 1) da tiempos aproximados que se desfasan; aquí se anclan a las pausas
REALES del audio (silencedetect) en los cierres de frase y las palabras se reparten dentro de cada tramo según su duración hablada estimada.
Uso: python3 alinear-palabras.py <audio.wav> <palabras.json de whisper> <salida.json> ["palabra:inicio_de_pausa,…"]     (tiempos en segundos del archivo de origen)
Anclas manuales opcionales: cada "palabra:segundo" ancla la PRIMERA aparición (en orden) de esa palabra a la pausa que empieza en ese segundo; sin ellas se emparejan solas.
"""
import json, re, subprocess, sys
wav, wjson, salida = sys.argv[1:4]
MANUALES = [(x.rsplit(':', 1)[0], float(x.rsplit(':', 1)[1])) for x in sys.argv[4].split(',,')] if len(sys.argv) > 4 else None
W = json.load(open(wjson))
DUR = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',wav]))
out = subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',wav,'-af','silencedetect=noise=-34dB:d=0.12','-f','null','-'],capture_output=True,text=True).stderr
pausas, st = [], None
for l in out.split('\n'):
    m = re.search(r'silence_start: ([\d.]+)', l)
    if m: st = float(m.group(1))
    m = re.search(r'silence_end: ([\d.]+)', l)
    if m and st is not None: pausas.append((st, float(m.group(1)))); st = None
if st is not None: pausas.append((st, DUR))
inicio = pausas[0][1] if pausas and pausas[0][0] < 0.05 else 0.0
fin = pausas[-1][0] if pausas and pausas[-1][1] >= DUR - 0.05 else DUR
def peso(w):
    w2 = re.sub(r'[^\wáéíóúñü]', '', w.lower()); return max(2, len(w2)) + 1.5
# anclas: palabras con puntuación cuyo cierre debe coincidir con una pausa real. Se emparejan en ORDEN (programación dinámica) minimizando la distancia
# entre el final que da Whisper y el inicio de la pausa; un punto exige una pausa más larga que una coma.
puntuadas = [i for i, x in enumerate(W[:-1]) if re.search(r'[.,?!"]$', x['w'])]
TOL, SESGO = 2.6, 0.6                           # Whisper suele dar los finales ~0,6 s tarde: se compensa antes de emparejar
def costo(i, k):
    a, b = pausas[k]; x = W[i]
    d = abs(a - (x['t1'] - SESGO))
    if not (inicio < a and b < fin) or d > TOL: return None
    if re.search(r'[.?!]"?$', x['w']) and (b - a) < 0.2: return None
    return d + (0 if (b - a) >= 0.2 else 0.3)
SALTO = 0.3                                   # costo de no anclar una palabra / una pausa
n, m = len(puntuadas), len(pausas)
if MANUALES:
    anclas, desde = {}, 0
    for pal, seg in MANUALES:
        i = next((j for j in range(desde, len(W) - 1) if W[j]['w'] == pal), None)
        k = min(range(len(pausas)), key=lambda q: abs(pausas[q][0] - seg))
        if i is not None and abs(pausas[k][0] - seg) < 0.1: anclas[i] = pausas[k]; desde = i + 1
    n = m = 0
D = [[0.0] * (m + 1) for _ in range(n + 1)]; B = [[None] * (m + 1) for _ in range(n + 1)]
for i in range(n + 1):
    for k in range(m + 1):
        if i == 0 and k == 0: continue
        best, how = float('inf'), None
        if i > 0 and D[i-1][k] + SALTO < best: best, how = D[i-1][k] + SALTO, 'p'
        pk = 2.5 if (pausas[k-1][1] - pausas[k-1][0]) >= 0.25 else 0.3          # una pausa larga casi siempre cae en una puntuación: no dejarla sin emparejar
        if k > 0 and D[i][k-1] + pk < best: best, how = D[i][k-1] + pk, 'k'
        if i > 0 and k > 0:
            c = costo(puntuadas[i-1], k-1)
            if c is not None and D[i-1][k-1] + c < best: best, how = D[i-1][k-1] + c, 'm'
        D[i][k], B[i][k] = best, how
if not MANUALES: anclas = {}
i, k = n, m
while i > 0 or k > 0:
    h = B[i][k]
    if h == 'm': anclas[puntuadas[i-1]] = pausas[k-1]; i -= 1; k -= 1
    elif h == 'p': i -= 1
    else: k -= 1
cortes = [-1] + sorted(anclas) + [len(W) - 1]
res = [None] * len(W)
for n in range(len(cortes) - 1):
    i0, i1 = cortes[n] + 1, cortes[n + 1]
    s = anclas[cortes[n]][1] if cortes[n] >= 0 else inicio
    e = anclas[cortes[n + 1]][0] if cortes[n + 1] in anclas else fin
    # islas de habla del tramo (se descartan las pausas no ancladas que caen dentro)
    isl, cur = [], s
    for a, b in pausas:
        if b <= s or a >= e: continue
        if a - cur > 0.04: isl.append((cur, min(a, e)))
        cur = max(cur, b)
    if e - cur > 0.04: isl.append((cur, e))
    if not isl: isl = [(s, e)]
    tot = sum(b - a for a, b in isl); pesos = [peso(W[i]['w']) for i in range(i0, i1 + 1)]; tp = sum(pesos)
    def real(x):
        acc = 0.0
        for a, b in isl:
            if x <= acc + (b - a) + 1e-9: return a + (x - acc)
            acc += b - a
        return isl[-1][1]
    c = 0.0
    for i, p in zip(range(i0, i1 + 1), pesos):
        res[i] = {'w': W[i]['w'], 't0': round(real(c / tp * tot), 3), 't1': round(real((c + p) / tp * tot - 1e-6), 3)}; c += p
json.dump(res, open(salida, 'w'), ensure_ascii=False)
print(f"{len(anclas)} anclas con pausas reales, {len(W)} palabras, voz de {inicio:.2f}s a {fin:.2f}s")
