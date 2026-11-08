"""
APRENDIZAJE DEL ESTILO DEL USUARIO — todo por código; Claude solo interviene para lo CUALITATIVO (cero tokens en lo cuantitativo).

  python3 scripts/aprender.py <slug> [--cierre]
    · lee SOLO los eventos nuevos de analisis/ediciones-usuario.jsonl (lo que el usuario hizo a mano en el editor; las órdenes de Claude no cuentan),
    · los funde en biblioteca/aprendizaje/perfil.json (contadores y medias; nunca guarda el historial crudo, así no crece),
    · regenera el bloque AUTOMÁTICO de biblioteca/aprendizaje/estilo-usuario.md (≤ ~25 líneas): solo lo que se repite (n ≥ 3) y domina (≥ 60 %),
    · con --cierre (al pasar al editor) suma también lo que aceptó/descartó en la propuesta, las palabras que quitó del guion y su texto de recomendaciones,
    · si quedan notas CUALITATIVAS sin condensar (recomendaciones, notas del chat) crea UN pedido `aprendizaje` para Claude (≈100–300 tokens). Si no hay, NO se le pide nada.
  python3 scripts/aprender.py --condensado   (lo corre Claude al terminar: borra las notas pendientes ya condensadas)
"""
import hashlib, json, os, sys, time
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); BIB = os.path.join(RAIZ, os.environ.get('GOJAGUAR_BIBLIOTECA', 'biblioteca'))
APR = os.path.join(BIB, 'aprendizaje'); PERFIL = os.path.join(APR, 'perfil.json'); MD = os.path.join(APR, 'estilo-usuario.md')
os.makedirs(APR, exist_ok=True)
perfil = json.load(open(PERFIL)) if os.path.exists(PERFIL) else {'n': {}, 'num': {}, 'pendientes': [], 'vistos': [], 'proyectos': 0}
def suma(cat, clave, v=None):
    d = perfil['n'].setdefault(cat, {}); d[clave] = d.get(clave, 0) + 1
    if v is not None:
        m = perfil['num'].setdefault(f'{cat}.{clave}', [0, 0.0]); m[0] += 1; m[1] += float(v)
media = lambda k: (perfil['num'][k][1] / perfil['num'][k][0]) if k in perfil['num'] and perfil['num'][k][0] else None

if sys.argv[1:2] == ['--condensado']:
    perfil['pendientes'] = []; json.dump(perfil, open(PERFIL, 'w'), ensure_ascii=False); print('notas pendientes limpiadas'); sys.exit()
slug = sys.argv[1]; cierre = '--cierre' in sys.argv; PD = os.path.join(BIB, 'proyectos', slug, 'analisis')
est_f = os.path.join(PD, 'aprendizaje-estado.json'); est = json.load(open(est_f)) if os.path.exists(est_f) else {'leidas': 0}
ev_f = os.path.join(PD, 'ediciones-usuario.jsonl'); lineas = open(ev_f).read().splitlines() if os.path.exists(ev_f) else []
nuevas = lineas[est['leidas']:]
for l in nuevas:
    try: e = json.loads(l)
    except Exception: continue
    op = e.get('op')
    if e.get('quien') == 'chat':
        perfil['pendientes'].append(e.get('texto', '')[:300]); continue
    if op == 'set_zoom': (suma('zoom', e['zoom']['k'], e['zoom']['a']) if e.get('zoom') else suma('zoom', 'quitado'))
    elif op == 'set_transition': (suma('transicion', e['tr']['k'], e['tr']['d']) if e.get('tr') else suma('transicion', 'quitada'))
    elif op == 'set_clip_color' and e.get('color'):
        for k in ('brillo', 'contraste', 'saturacion'): suma('color', k, e['color'].get(k, 1))
    elif op in ('volume', 'speed', 'speed_all'): suma(op, 'valor', e.get('v', 1))
    elif op in ('add_text', 'add_layer'): suma('capa', f"{e.get('tipo')}:{e.get('tpl') or 'texto'}", e.get('size') or 0); (suma('color_texto', e['color']) if e.get('color') else None)
    elif op in ('add_overlay', 'clip_to_overlay'): suma('superpuesto', e.get('tr') or 'sin_transicion')
    elif op in ('delete_clip', 'delete_range', 'delete_ranges'): suma('recorte', 'borrar')
    elif op == 'split': suma('recorte', 'dividir')
    elif op == 'update_layer' or op == 'update_overlay': suma('ajuste', op)
est['leidas'] = len(lineas); json.dump(est, open(est_f, 'w'))

if cierre and not est.get('cerrado'):
    est['cerrado'] = True; json.dump(est, open(est_f, 'w')); perfil['proyectos'] += 1
    try:
        g = json.load(open(os.path.join(PD, 'guion.json'))); tot = quit_ = rest = 0
        for p in g['parrafos']:
            for w in p['words']:
                tot += 1; quit_ += bool(w.get('del')); rest += bool(w.get('mul') and not w.get('del'))
        if tot: suma('guion', 'palabras', tot); perfil['n']['guion']['quitadas'] = perfil['n']['guion'].get('quitadas', 0) + quit_; perfil['n']['guion']['muletillas_restauradas'] = perfil['n']['guion'].get('muletillas_restauradas', 0) + rest
    except Exception: pass
    try:
        for z in json.load(open(os.path.join(PD, 'propuesta.json')))['zonas']:
            t = (z.get('opciones') or [{}])[z.get('elegida', 0)].get('tipo', '?'); suma('propuesta_' + z.get('decision', 'pendiente'), t)
            if z.get('prompt'): suma('propuesta', 'con_prompt_propio'); perfil['pendientes'].append('Pidió en una zona: ' + z['prompt'][:200])
            if z.get('aportes'): suma('propuesta', 'aporta_sus_tomas')
    except Exception: pass
    try:
        t = json.load(open(os.path.join(PD, 'notas-edicion.json'))).get('texto', '').strip()
        if t:
            h = hashlib.sha1(t.encode()).hexdigest()[:8]
            if h not in perfil['vistos']: perfil['vistos'].append(h); perfil['pendientes'].append('Recomendaciones del usuario: ' + t[:600])
    except Exception: pass

# ---- bloque automático del .md (solo lo repetido y dominante) ----
def dom(cat, minimo=3, umbral=0.6):
    d = perfil['n'].get(cat, {}); n = sum(d.values())
    if n < minimo: return None
    k, v = max(d.items(), key=lambda x: x[1]); return (k, v, n) if v / n >= umbral else None
L = []
def linea(txt): L.append('- ' + txt)
if (z := dom('zoom')): m = media(f'zoom.{z[0]}'); linea(f"Zoom: prefiere **{z[0]}**" + (f" (~{m:.2f})" if m and z[0] != 'quitado' else '') + f" [{z[1]}/{z[2]}]")
if (t := dom('transicion')): m = media(f'transicion.{t[0]}'); linea(f"Transición: **{t[0]}**" + (f" (~{m:.2f} s)" if m else '') + f" [{t[1]}/{t[2]}]")
cs = [(k, media(f'color.{k}')) for k in ('brillo', 'contraste', 'saturacion') if media(f'color.{k}') is not None and perfil['n'].get('color', {}).get(k, 0) >= 3]
if cs: linea('Color (ajuste medio, 1 = sin cambio): ' + ', '.join(f'{k} {v:.2f}' for k, v in cs))
if (c := dom('capa')): linea(f"Texto/gráficos: usa sobre todo **{c[0]}**" + (f" (tamaño ~{media('capa.' + c[0]):.0f})" if media('capa.' + c[0]) else '') + f" [{c[1]}/{c[2]}]")
if (c := dom('color_texto')): linea(f"Color de texto habitual: {c[0]} [{c[1]}/{c[2]}]")
if (s := dom('superpuesto')): linea(f"Tomas superpuestas: entrada **{s[0]}** [{s[1]}/{s[2]}]")
for cat, ver in (('volume', 'Volumen de clip'), ('speed', 'Velocidad'), ('speed_all', 'Velocidad global')):
    if perfil['n'].get(cat, {}).get('valor', 0) >= 3 and media(f'{cat}.valor'): linea(f"{ver}: ~{media(f'{cat}.valor'):.2f}")
r = perfil['n'].get('recorte', {})
if r.get('borrar', 0) + r.get('dividir', 0) >= 5: linea(f"Corta mucho a mano ({r.get('borrar', 0)} borrados, {r.get('dividir', 0)} divisiones): revisar su ritmo")
g = perfil['n'].get('guion', {})
if g.get('palabras', 0) >= 200: linea(f"Guion: suele quitar ~{100 * g.get('quitadas', 0) / g['palabras']:.0f} % de las palabras" + (' y restaura muletillas a veces' if g.get('muletillas_restauradas', 0) >= 3 else ''))
for dec, et in (('aceptada', 'Acepta'), ('descartada', 'Descarta')):
    if (p := dom('propuesta_' + dec, 2, 0.5)): linea(f"{et} sobre todo ilustraciones tipo **{p[0]}** [{p[1]}/{p[2]}]")
if perfil['n'].get('propuesta', {}).get('aporta_sus_tomas', 0) >= 2: linea('Suele subir sus propias tomas a las zonas')
prev = open(MD).read() if os.path.exists(MD) else ''
cual = prev.split('<!-- cualitativo -->')[1].split('<!-- fin -->')[0].strip() if '<!-- cualitativo -->' in prev else '(nada aún)'
open(MD, 'w').write(f"# Estilo del usuario (aprendido; leer ANTES de editar, pesa poco)\nPrevalece sobre el estilo base cuando chocan. Actualizado {time.strftime('%Y-%m-%d')} · {perfil['proyectos']} proyecto(s) · lo repetido y dominante, generado por código.\n\n## Automático\n<!-- auto -->\n" + ('\n'.join(L) or '- (aún sin patrones repetidos)') + f"\n<!-- /auto -->\n\n## Cualitativo (lo condensa Claude; máx. 15 líneas, una regla por línea, sin repetir)\n<!-- cualitativo -->\n{cual}\n<!-- fin -->\n")
json.dump(perfil, open(PERFIL, 'w'), ensure_ascii=False)

# ---- Claude solo si hay notas cualitativas nuevas ----
if perfil['pendientes']:
    sd = os.path.join(BIB, 'solicitudes'); os.makedirs(sd, exist_ok=True)
    if not any(json.load(open(os.path.join(sd, f))).get('tipo') == 'aprendizaje' and json.load(open(os.path.join(sd, f))).get('estado') in ('pendiente', 'en_curso') for f in os.listdir(sd) if f.endswith('.json')):
        sid = f"{int(time.time() * 1000)}-{slug}-aprendizaje"
        json.dump({'id': sid, 'slug': slug, 'tipo': 'aprendizaje', 'estado': 'pendiente', 'creado': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()), 'referencias': []}, open(os.path.join(sd, sid + '.json'), 'w'))
        print('pedido aprendizaje creado')
print(f"ok: {len(nuevas)} eventos nuevos, {len(L)} patrones, {len(perfil['pendientes'])} notas pendientes")
