"""Recorta el tramo elegido: 16:9 1080p, sin silencios, con fundidos de 6 ms en cada unión."""
import json, subprocess, sys
import os
SRC = os.environ.get('VIDEO_ORIGEN', '')      # ruta del video a recortar (el original de prueba usado en este experimento ya no existe)
if not SRC: sys.exit('Define VIDEO_ORIGEN con la ruta del video a recortar')
START, END = 35.0, 67.7           # tramo elegido (segundos del original)
OUT = 'work/seg_cut.mp4'
sil = [r for r in json.load(open('/tmp/ranges.json')) if r[1] > START and r[0] < END]
keep, cur = [], START
for a, b in sorted(sil):
    a, b = max(a, START), min(b, END)
    if a - cur > 0.05: keep.append((cur, a))
    cur = max(cur, b)
if END - cur > 0.05: keep.append((cur, END))
OFF = START - 0.5                 # el input arranca 0.5 s antes
parts_v, parts_a, F = [], [], 0.006
for i, (a, b) in enumerate(keep):
    a, b = a - OFF, b - OFF
    parts_v.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos,fps=30[v{i}]")
    parts_a.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={F},afade=t=out:st={b-a-F:.4f}:d={F}[a{i}]")
n = len(keep)
fc = ';'.join(parts_v + parts_a) + ';' + ''.join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]"
open('work/filter.txt', 'w').write(fc)
print(f"{n} tramos, {sum(b-a for a,b in keep):.1f}s de {END-START:.1f}s")
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-hwaccel','videotoolbox','-ss',str(OFF),'-t',str(END-OFF+0.5),'-i',SRC,
  '-/filter_complex','work/filter.txt','-map','[v]','-map','[a]','-c:v','libx264','-crf','14','-preset','fast','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','192k',OUT], check=True)
json.dump(keep, open('work/keep.json','w'))
