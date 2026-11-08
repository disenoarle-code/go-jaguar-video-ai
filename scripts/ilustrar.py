"""
UNA llamada: renderiza una composición PARAMETRIZADA de Remotion con transparencia, la empaca para el editor y devuelve lo que hay que ejecutar (≈100 tokens de salida).
Con caché: la misma composición + mismos parámetros NO se vuelve a renderizar (biblioteca/animaciones/).

  python3 scripts/ilustrar.py <Composicion> '<props JSON>' [inicio_en_segundos=0] [nombre]
  Composiciones: Iconos · Modelo3D (ver experiments/estilo-3d/src; parámetros y valores por defecto en los .tsx)
  Salida: JSON con las operaciones listas para  editor.batch(<salida>)  (import_asset + add_overlay, sin audio)
Ejemplos:
  python3 scripts/ilustrar.py Iconos '{"items":[{"icono":"tabler-perfume.svg","etiqueta":"PERFUME"}],"duracion":3}' 12
  python3 scripts/ilustrar.py Modelo3D '{"modelo":"assets/modelos/<id>/<id>.gltf","movimiento":"giro1","duracion":3}' 20
Los iconos/modelos se traen antes con  python3 experiments/estilo-3d/scripts/assets.py traer <tipo> <palabras>.
"""
import hashlib, json, os, shutil, subprocess, sys
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R3D = os.path.join(RAIZ, 'experiments', 'estilo-3d'); LIB = os.path.join(RAIZ, os.environ.get('GOJAGUAR_BIBLIOTECA', 'biblioteca'), 'animaciones')
if len(sys.argv) < 3: sys.exit(__doc__)
comp, props = sys.argv[1], json.loads(sys.argv[2]); inicio = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
canon = json.dumps([comp, props], sort_keys=True, ensure_ascii=False); key = hashlib.sha1(canon.encode()).hexdigest()[:10]
os.makedirs(LIB, exist_ok=True); ij = os.path.join(LIB, 'indice.json'); idx = json.load(open(ij)) if os.path.exists(ij) else {}
pack = os.path.join(LIB, f'{key}.pack.mp4')
if key not in idx or not os.path.exists(pack):
    pf = os.path.join(R3D, 'out', f'{key}.props.json'); seq = os.path.join(R3D, 'out', key)
    os.makedirs(os.path.dirname(pf), exist_ok=True); shutil.rmtree(seq, ignore_errors=True); json.dump(props, open(pf, 'w'))
    r = subprocess.run(['npx', 'remotion', 'render', 'src/index.ts', comp, f'out/{key}', '--sequence', '--image-format=png', f'--props={pf}', '--log=error'], cwd=R3D, capture_output=True, text=True)
    if r.returncode: sys.exit('render falló: ' + (r.stderr or r.stdout)[-300:])
    p = subprocess.run([sys.executable, os.path.join(RAIZ, 'scripts', 'remotion-a-pack.py'), seq, pack], capture_output=True, text=True)
    if p.returncode: sys.exit('empaquetado falló: ' + p.stderr[-300:])
    info = json.loads(p.stdout); shutil.rmtree(seq, ignore_errors=True); os.remove(pf)
    idx[key] = {'comp': comp, 'props': props, 'width': info['width'], 'height': info['height'], 'fps': info['fps'], 'duration': info['duration']}
    json.dump(idx, open(ij, 'w'), indent=1, ensure_ascii=False)
i = idx[key]; nombre = sys.argv[4] if len(sys.argv) > 4 else f'{comp.lower()}-{key[:4]}'
asset = {'id': f'a-{key}', 'name': nombre, 'kind': 'video', 'proxy': f'api/files/animaciones/{key}.pack.mp4', 'original': pack, 'duration': i['duration'], 'fps': i['fps'], 'width': i['width'], 'height': i['height'], 'alfa': 'pack'}
print(json.dumps([{'op': 'import_asset', 'asset': asset}, {'op': 'add_overlay', 'asset': asset['id'], 'start': inicio, 'src_in': 0, 'src_out': i['duration'], 'volume': 0}], ensure_ascii=False, separators=(',', ':')))
