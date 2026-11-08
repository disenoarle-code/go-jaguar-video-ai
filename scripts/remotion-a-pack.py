"""
Convierte una escena de Remotion con FONDO TRANSPARENTE (secuencia PNG con alfa) en un MP4 "pack" que el editor entiende (sin códecs con alfa):
  izquierda = color PREMULTIPLICADO sobre negro · derecha = alfa INVERTIDO en gris · todo fotogramas clave (scrub instantáneo).
Uso:  python3 remotion-a-pack.py <carpeta_con_pngs> <salida.pack.mp4> [fps=30]
Render de Remotion:  cd experiments/estilo-3d && npx remotion render src/index.ts <Composicion> out/<nombre> --sequence --image-format=png
Registro en el proyecto (assets con `alfa:'pack'`, width/height = tamaño de UNA mitad): ver docs/guia/07-… "Remotion con transparencia".
"""
import glob, json, subprocess, sys
d, out = sys.argv[1], sys.argv[2]
fps = sys.argv[3] if len(sys.argv) > 3 else '30'
from PIL import Image
pngs = sorted(glob.glob(f'{d}/*.png'))
if not pngs: sys.exit('no hay PNG en ' + d)
w, h = Image.open(pngs[0]).size
fc = (f"[0:v]format=rgba,split[a][b];color=black:s={w}x{h}:r={fps}[bg];[bg][a]overlay=shortest=1:format=auto,format=yuv420p[c];"
      f"[b]alphaextract,negate,format=yuv420p[m];[c][m]hstack")
r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', fps, '-pattern_type', 'glob', '-i', f'{d}/*.png', '-filter_complex', fc,
                    '-c:v', 'libx264', '-crf', '10', '-g', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
if r.returncode: sys.exit('ffmpeg falló')
print(json.dumps({'archivo': out, 'width': w, 'height': h, 'fps': float(fps), 'duration': round(len(pngs) / float(fps), 3), 'frames': len(pngs), 'alfa': 'pack'}))
