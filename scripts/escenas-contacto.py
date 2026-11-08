"""
Hoja de contacto por ESCENAS: una sola imagen con un fotograma por escena y su hora marcada (ahorra tokens: ~20 fotogramas ≈ 1 imagen).

Uso:  python3 escenas-contacto.py <video> <carpeta_salida> [max_fotogramas=20]
Salida: <carpeta_salida>/hoja.jpg  y  <carpeta_salida>/escenas.json
  escenas.json = { duracion, hoja, columnas, escenas: [{ n, t0, t1, t }] }   (t = segundo del fotograma mostrado, n = número de celda, de izquierda a derecha y de arriba abajo)
Detecta cortes con PySceneDetect (AdaptiveDetector, sobre fotogramas reducidos). Si el video casi no tiene cortes (una sola toma, grabación de pantalla),
reparte fotogramas cada ~4 s para no perder lo que cambia dentro de la toma.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
MAXF = int(sys.argv[3]) if len(sys.argv) > 3 else 20
os.makedirs(out, exist_ok=True)

def duracion(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0

IMG = os.path.splitext(src)[1].lower() in ('.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.gif', '.bmp', '.tif', '.tiff')
dur = 0.0 if IMG else duracion(src)
escenas = []
if IMG or dur <= 0:
    escenas = [(0.0, 0.0)]
else:
    try:
        from scenedetect import open_video, SceneManager, AdaptiveDetector
        v = open_video(src); sm = SceneManager(); sm.auto_downscale = True
        sm.add_detector(AdaptiveDetector()); sm.detect_scenes(v)
        escenas = [(a.get_seconds(), b.get_seconds()) for a, b in sm.get_scene_list()]
    except Exception as e:
        print('aviso: PySceneDetect falló, se reparten fotogramas parejos:', e, file=sys.stderr)
    if not escenas: escenas = [(0.0, dur)]
    # escenas muy largas (toma única, pantalla): se parten cada ~4 s para ver lo que cambia dentro
    partidas = []
    for a, b in escenas:
        n = max(1, int(round((b - a) / 4.0)))
        for k in range(n): partidas.append((a + (b - a) * k / n, a + (b - a) * (k + 1) / n))
    escenas = partidas
    if len(escenas) > MAXF:                                   # demasiadas: se quedan repartidas parejo
        idx = sorted({round(i * (len(escenas) - 1) / (MAXF - 1)) for i in range(MAXF)})
        escenas = [escenas[i] for i in idx]

celdas = []
for n, (a, b) in enumerate(escenas):
    t = round((a + b) / 2, 2)
    f = os.path.join(out, f'_f{n}.jpg')
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + ([] if IMG else ['-ss', str(t)]) + ['-i', src, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', f]
    if subprocess.run(cmd).returncode == 0 and os.path.exists(f): celdas.append((n, round(a, 2), round(b, 2), t, f))

if not celdas: sys.exit('no pude sacar fotogramas')
COLS = 4 if len(celdas) > 6 else min(3, len(celdas)) if len(celdas) > 1 else 1
ims = [Image.open(c[4]).convert('RGB') for c in celdas]
w, h = ims[0].size
filas = (len(ims) + COLS - 1) // COLS
hoja = Image.new('RGB', (COLS * w, filas * h), (20, 20, 20))
try: fuente = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception: fuente = ImageFont.load_default()
d = ImageDraw.Draw(hoja)
for i, (im, c) in enumerate(zip(ims, celdas)):
    x, y = (i % COLS) * w, (i // COLS) * h
    hoja.paste(im.resize((w, h)), (x, y))
    etq = f'{i+1}  {int(c[3] // 60)}:{c[3] % 60:04.1f}' if not IMG else 'foto'
    d.rectangle([x, y, x + 12 + 11 * len(etq), y + 28], fill=(0, 0, 0)); d.text((x + 6, y + 3), etq, fill=(255, 255, 255), font=fuente)
    d.rectangle([x, y, x + w - 1, y + h - 1], outline=(20, 20, 20))
hoja.save(os.path.join(out, 'hoja.jpg'), quality=82)
for c in celdas: os.remove(c[4])
json.dump({'duracion': round(dur, 2), 'hoja': 'hoja.jpg', 'columnas': COLS, 'escenas': [{'n': i + 1, 't0': c[1], 't1': c[2], 't': c[3]} for i, c in enumerate(celdas)]}, open(os.path.join(out, 'escenas.json'), 'w'), indent=1)
print(f'{len(celdas)} escenas → {os.path.join(out, "hoja.jpg")}')
