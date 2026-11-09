"""
Buscar y traer recursos con MÍNIMOS TOKENS (las APIs devuelven miles de entradas/metadatos: aquí solo se imprime lo útil, ≤5 líneas; NUNCA se imprime el contenido de un archivo).
Busca SIEMPRE en inglés. Todo queda en public/assets/ (úsalo con staticFile()) y se anota en public/assets/credits.json.

  node scripts/py.mjs scripts/assets.py traer <icono|modelo|hdri|textura> <palabras>   ← LO NORMAL: 1 llamada, 1 línea de salida (reutiliza lo ya bajado; si no, busca, elige el 1.º y lo baja)
  node scripts/py.mjs scripts/assets.py buscar icono <palabra>        Iconify · solo licencias MIT / Apache-2.0 / CC0 (el resto se descarta)
  node scripts/py.mjs scripts/assets.py buscar modelo <palabra>       Poly Haven modelos 3D (CC0)      · salida: id | categorías | polígonos
  node scripts/py.mjs scripts/assets.py buscar hdri <palabra>         Poly Haven HDRIs de iluminación (CC0)
  node scripts/py.mjs scripts/assets.py buscar textura <palabra>      Poly Haven texturas PBR (CC0)
  node scripts/py.mjs scripts/assets.py categorias <modelo|hdri|textura>   categorías disponibles (para afinar la búsqueda)
  node scripts/py.mjs scripts/assets.py bajar icono <set:nombre> [color=#ffffff]
  node scripts/py.mjs scripts/assets.py bajar modelo <id> [res=1k]    → public/assets/modelos/<id>/<id>.gltf (+ .bin y texturas; carga con useGLTF(staticFile(...)))
  node scripts/py.mjs scripts/assets.py bajar hdri <id> [res=1k]      → public/assets/hdri/<id>_<res>.hdr
  node scripts/py.mjs scripts/assets.py bajar textura <id> [res=1k]   → public/assets/texturas/<id>/{diff,nor,rough}.jpg
"""
import json, os, subprocess, sys, urllib.parse
AQUI = os.path.dirname(os.path.abspath(__file__)); ASSETS = os.path.normpath(os.path.join(AQUI, '..', 'public', 'assets'))
OK_ICON = {'MIT', 'Apache-2.0', 'CC0-1.0'}
PH = 'https://api.polyhaven.com'
TIPOS_PH = {'modelo': 'models', 'hdri': 'hdris', 'textura': 'textures'}

def curl(u, *a):
    r = subprocess.run(['curl', '-sfL', '--max-time', '120', *a, u], capture_output=True, text=True)
    if r.returncode: sys.exit(f'curl falló ({r.returncode}) en {u.split("?")[0]}')
    return r.stdout
def jget(u):
    if u.startswith(PH + '/assets?') or u.startswith(PH + '/categories/'):     # listas grandes: caché de 7 días (rápido y sin repetir la descarga)
        import hashlib, time
        c = os.path.join(AQUI, '..', '.cache'); os.makedirs(c, exist_ok=True); f = os.path.join(c, hashlib.md5(u.encode()).hexdigest() + '.json')
        if os.path.exists(f) and time.time() - os.path.getmtime(f) < 7 * 86400: return json.load(open(f))
        d = json.loads(curl(u)); json.dump(d, open(f, 'w')); return d
    return json.loads(curl(u))
def credito(**c):
    os.makedirs(ASSETS, exist_ok=True); cf = os.path.join(ASSETS, 'credits.json'); cr = json.load(open(cf)) if os.path.exists(cf) else []
    cr = [x for x in cr if x.get('archivo') != c['archivo']] + [c]; json.dump(cr, open(cf, 'w'), indent=1, ensure_ascii=False)
def descargar(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    subprocess.run(['curl', '-sfL', '--max-time', '300', '-o', dest, url], check=True)
    if not os.path.getsize(dest): sys.exit('descarga vacía: ' + dest)

def buscar_icono(q, n=5, imprimir=True):
    d = jget('https://api.iconify.design/search?limit=64&query=' + urllib.parse.quote(q)); out = []
    for i in d.get('icons', []):
        pre = i.split(':')[0]; lic = d['collections'].get(pre, {}).get('license', {}).get('spdx', '?')
        if lic in OK_ICON: out.append(f'{i}  {lic}')
        if len(out) == n: break
    if imprimir: print('\n'.join(out) or 'sin resultados con licencia permitida (MIT / Apache-2.0 / CC0)')
    return [o.split()[0] for o in out]

def buscar_ph(tipo, q, n=5, imprimir=True):
    d = jget(f'{PH}/assets?t={TIPOS_PH[tipo]}'); pal = q.lower().split(); res = []
    for id_, a in d.items():
        nombre = a['name'].lower(); resto = ' '.join(a.get('tags', []) + a.get('categories', []))
        if all(p in nombre or p in resto for p in pal):
            res.append((-sum(p in nombre for p in pal), a.get('polycount', 0) or 0, id_, a))
    res.sort(key=lambda x: x[:3])
    if not imprimir: return [r[2] for r in res[:n]]
    for _, pc, id_, a in res[:n]:
        print(f"{id_} | {','.join(a.get('categories', [])[:3])}" + (f' | {pc} polígonos' if tipo == 'modelo' else ''))
    if not res: print('sin resultados: prueba con otra palabra en inglés o mira `categorias`')

def bajar_icono(ref, color='#ffffff'):
    pre, nombre = ref.split(':')
    info = jget(f'https://api.iconify.design/collection?prefix={pre}&info=true'); lic = info.get('info', info).get('license', {}).get('spdx', '?')
    if lic not in OK_ICON: sys.exit(f'licencia {lic} no permitida (exige atribución u otra): descartado')
    f = f'{pre}-{nombre}.svg'; descargar(f'https://api.iconify.design/{pre}/{nombre}.svg?color={urllib.parse.quote(color)}', os.path.join(ASSETS, f))
    credito(set=pre, nombre=nombre, licencia=lic, archivo=f); print(f'ok {f} ({lic})')

def bajar_modelo(id_, res='1k'):
    f = jget(f'{PH}/files/{id_}').get('gltf', {})
    if res not in f: sys.exit(f'resolución {res} no existe; hay: ' + ', '.join(f))
    g = f[res]['gltf']; base = os.path.join(ASSETS, 'modelos', id_); total = 0
    descargar(g['url'], os.path.join(base, f'{id_}.gltf')); total += g.get('size', 0)
    for rel, inc in g.get('include', {}).items(): descargar(inc['url'], os.path.join(base, rel)); total += inc.get('size', 0)
    credito(set='polyhaven', nombre=id_, licencia='CC0-1.0', archivo=f'modelos/{id_}/{id_}.gltf'); print(f'ok modelos/{id_}/{id_}.gltf ({total / 1e6:.1f} MB, CC0)')

def bajar_hdri(id_, res='1k'):
    h = jget(f'{PH}/files/{id_}').get('hdri', {})
    if res not in h: sys.exit(f'resolución {res} no existe; hay: ' + ', '.join(h))
    f = f'hdri/{id_}_{res}.hdr'; descargar(h[res]['hdr']['url'], os.path.join(ASSETS, f))
    credito(set='polyhaven', nombre=id_, licencia='CC0-1.0', archivo=f); print(f'ok {f} (CC0)')

def bajar_textura(id_, res='1k'):
    d = jget(f'{PH}/files/{id_}'); mapas = {'diff': 'Diffuse', 'nor': 'nor_gl', 'rough': 'Rough'}
    for corto, k in mapas.items():
        if k in d and res in d[k] and 'jpg' in d[k][res]: descargar(d[k][res]['jpg']['url'], os.path.join(ASSETS, 'texturas', id_, f'{corto}.jpg'))
    credito(set='polyhaven', nombre=id_, licencia='CC0-1.0', archivo=f'texturas/{id_}/diff.jpg'); print(f'ok texturas/{id_}/ ({", ".join(mapas)}; CC0)')

def traer(tipo, q, res='1k'):
    """TODO en una llamada y ≤1 línea de salida: reutiliza lo ya descargado; si no, busca, elige el primero (el más ligero entre los que coinciden) y lo baja."""
    cf = os.path.join(ASSETS, 'credits.json'); cr = json.load(open(cf)) if os.path.exists(cf) else []
    pal = q.lower().replace('-', ' ').split()
    tipo_de = lambda c: 'modelo' if c['archivo'].startswith('modelos/') else 'hdri' if c['archivo'].startswith('hdri/') else 'textura' if c['archivo'].startswith('texturas/') else 'icono'
    for c in cr:
        if tipo_de(c) == tipo and all(p in c['nombre'].lower().replace('_', ' ').replace('-', ' ') for p in pal) and os.path.exists(os.path.join(ASSETS, c['archivo'])):
            print(f"ya existe: {c['archivo']}"); return
    r = buscar_icono(q, 1, False) if tipo == 'icono' else buscar_ph(tipo, q, 1, False)
    if not r: sys.exit('sin resultados: prueba otra palabra en inglés')
    {'icono': bajar_icono, 'modelo': bajar_modelo, 'hdri': bajar_hdri, 'textura': bajar_textura}[tipo](r[0], *( [res] if tipo != 'icono' else []))

a = sys.argv[1:]
if len(a) >= 3 and a[0] == 'traer': traer(a[1], ' '.join(a[2:]))
elif len(a) >= 3 and a[0] == 'buscar': buscar_icono(' '.join(a[2:])) if a[1] == 'icono' else buscar_ph(a[1], ' '.join(a[2:]))
elif len(a) == 2 and a[0] == 'categorias':
    d = jget(f'{PH}/categories/{TIPOS_PH[a[1]]}'); print(', '.join(f'{k}({v})' for k, v in sorted(d.items(), key=lambda x: -x[1])[:40]))
elif len(a) >= 3 and a[0] == 'bajar': {'icono': bajar_icono, 'modelo': bajar_modelo, 'hdri': bajar_hdri, 'textura': bajar_textura}[a[1]](*a[2:])
else: print(__doc__)
