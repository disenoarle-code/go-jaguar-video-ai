"""
Recorte de PERSONA en video (máscara de transparencia) — multiplataforma (Mac, Windows, Linux), sin nada propio de Mac.

Usa Robust Video Matting (modelo ONNX MobileNetV3, ~15 MB) con onnxruntime: hecho para video, estable de un cuadro al siguiente (recurrente) y con buen cabello.
Licencia del modelo: GPL-3.0 (PeterL1n/RobustVideoMatting). Se descarga aparte (no va dentro del repo); revisar antes de redistribuirlo empaquetado.

Instalación única (gratis, ~50 MB en total):
    python3 -m venv ~/.gojaguar-recorte && ~/.gojaguar-recorte/bin/pip install onnxruntime numpy pillow          # Windows: %USERPROFILE%\\.gojaguar-recorte\\Scripts\\pip
    descargar https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx  →  ~/.gojaguar-recorte/modelos/

Uso:
    ~/.gojaguar-recorte/bin/python recortar-persona.py <video> <salida_mascara.mp4> [--ini S] [--fin S] [--fps 30] [--lado 768] [--png carpeta]
La salida es un video en ESCALA DE GRISES (blanco = persona, negro = fondo) del mismo tamaño que el de entrada y que empieza en `--ini`
(los tiempos de la máscara = tiempos del video - ini). El editor la usa como transparencia de la persona (`proxies/<video>.recorte.mp4`).
"""
import argparse, os, subprocess, sys, time
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('salida')
ap.add_argument('--ini', type=float, default=0.0); ap.add_argument('--fin', type=float, default=0.0)
ap.add_argument('--fps', type=float, default=30.0); ap.add_argument('--lado', type=int, default=768, help='lado mayor con el que se procesa (más = más detalle y más lento)')
ap.add_argument('--png', help='guarda cada cuadro (original | máscara | sobre verde) para revisar la calidad')
ap.add_argument('--modelo', default=os.path.expanduser('~/.gojaguar-recorte/modelos/rvm_mobilenetv3_fp32.onnx'))
a = ap.parse_args()

import onnxruntime as ort
if not os.path.exists(a.modelo): sys.exit(f'Falta el modelo: {a.modelo} (ver instrucciones al inicio de este archivo)')
prov = [p for p in ('CUDAExecutionProvider', 'CPUExecutionProvider') if p in ort.get_available_providers()]      # CoreML se evita: no soporta bien este modelo recurrente
sess = ort.InferenceSession(a.modelo, providers=prov)

# tamaño y duración del video de entrada (ya con su giro: ffmpeg aplica la rotación)
pr = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'csv=p=0:s=x', a.video], capture_output=True, text=True).stdout.split()
w0, h0 = [int(v) for v in pr[0].split('x')[:2]]
dur = float(pr[-1]) if len(pr) > 1 else 0
rot = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream_side_data=rotation', '-of', 'csv=p=0', a.video], capture_output=True, text=True).stdout.strip()
if rot and abs(int(float(rot.split()[0]))) % 180 == 90: w0, h0 = h0, w0
fin = a.fin or dur
k = min(1.0, a.lado / max(w0, h0)); W, H = int(round(w0 * k / 2) * 2), int(round(h0 * k / 2) * 2)      # tamaño de trabajo (par)
n_est = int((fin - a.ini) * a.fps)
print(f'{w0}x{h0} → trabajo {W}x{H} | {a.ini:.2f}–{fin:.2f} s a {a.fps:g} fps (~{n_est} cuadros) | {prov[0]}', file=sys.stderr)

dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', f'{a.ini}', '-t', f'{fin - a.ini}', '-i', a.video, '-vf', f'fps={a.fps},scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{W}x{H}', '-r', f'{a.fps:g}', '-i', '-', '-c:v', 'libx264', '-crf', '14', '-g', '1', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.salida], stdin=subprocess.PIPE)
if a.png: os.makedirs(a.png, exist_ok=True)

ratio = np.array([min(1.0, 512 / max(W, H) * (a.lado / 512) ** 0.0)], dtype=np.float32)      # el cuadro ya viene reducido a `lado`: se procesa a esa escala con el modelo en su rango bueno
rec = [np.zeros((1, 1, 1, 1), dtype=np.float32) for _ in range(4)]
t0 = time.time(); n = 0; fb = W * H * 3
while True:
    buf = dec.stdout.read(fb)
    if len(buf) < fb: break
    src = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3).astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    fgr, pha, *rec = sess.run(None, {'src': src, 'r1i': rec[0], 'r2i': rec[1], 'r3i': rec[2], 'r4i': rec[3], 'downsample_ratio': np.array([min(1.0, 512 / max(W, H))], dtype=np.float32)})
    m = (np.clip(pha[0, 0], 0, 1) * 255).astype(np.uint8)
    enc.stdin.write(m.tobytes()); n += 1
    if a.png and n % 6 == 1:
        from PIL import Image
        o = (src[0].transpose(1, 2, 0) * 255).astype(np.uint8); al = (m.astype(np.float32) / 255)[:, :, None]
        verde = (o * al + np.array([20, 200, 90], dtype=np.float32) * (1 - al)).astype(np.uint8)
        Image.fromarray(np.concatenate([o, np.repeat(m[:, :, None], 3, 2), verde], 1)).save(os.path.join(a.png, f'{n:05d}.jpg'), quality=88)
    if n % 60 == 0: print(f'\r{n}/{n_est} cuadros ({n / (time.time() - t0):.1f} cuadros/s)', end='', file=sys.stderr)
enc.stdin.close(); enc.wait(); dec.wait()
print(f'\n{n} cuadros en {time.time() - t0:.0f} s → {a.salida}', file=sys.stderr)
