"""
Mide si un audio (o el audio de un video/MP4 exportado) está bien de volumen y NO saturado.
Uso:  node scripts/py.mjs medir-audio.py <archivo>
Imprime sonoridad (LUFS), pico, % de muestras casi al tope (>0,9), y qué tan parejo está el nivel de la voz. Objetivo: voz a -19…-14 LUFS,
pico <= -2 dBFS, sobre 0,9 ~ 0 %, desviación por segundo < 1 dB. Sale con código 1 si suena demasiado fuerte o saturado.
"""
import re, subprocess, sys
import numpy as np
f = sys.argv[1]
r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1]); TP = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)[-1])
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', f, '-vn', '-f', 's16le', '-ac', '1', '-ar', '16000', '-'])
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
n = len(x) // 1600; db = 20 * np.log10(np.sqrt((x[:n * 1600].reshape(n, 1600) ** 2).mean(1)) + 1e-9)
seg = [db[s:s + 10][db[s:s + 10] > np.percentile(db, 50)].mean() for s in range(0, n - 10, 10) if (db[s:s + 10] > np.percentile(db, 50)).sum() > 3]
tope = float((np.abs(x) > 0.9).mean() * 100); desv = float(np.std(seg)) if seg else 0.0
print(f'sonoridad {I:.1f} LUFS | pico {TP:.1f} dBFS | muestras >0,9: {tope:.3f} % | nivel de voz: desviación {desv:.2f} dB por segundo')
malo = I > -13 or TP > -1.0 or tope > 0.05
print('SUENA SATURADO O DEMASIADO FUERTE: bajar el volumen final' if malo else ('OK' + ('' if desv < 1.2 else ' (pero el nivel de la voz varía: revisar el nivelado)')))
sys.exit(1 if malo else 0)
