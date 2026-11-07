"""
Tiempos por palabra para subtítulos karaoke, medidos sobre el AUDIO REAL con ALINEACIÓN FORZADA (CTC).

Los tiempos por palabra de Whisper NO sirven para karaoke (se desfasan hasta ~1 s, y ~0,3 s aun en tramos cortos con -dtw). Aquí Whisper solo aporta el TEXTO
(words.json); los tiempos salen de un modelo wav2vec2 en español (Apache 2.0: jonatasgrosman/wav2vec2-large-xlsr-53-spanish) que alinea ese texto con el audio
letra por letra (torchaudio.functional.forced_align). Precisión típica ~30–50 ms.

Instalación única (gratis, ~1,5 GB; el modelo se baja la primera vez):
    python3 -m venv ~/.gojaguar-alinear && ~/.gojaguar-alinear/bin/pip install torch torchaudio transformers soundfile numpy
Uso:
    ~/.gojaguar-alinear/bin/python alinear-palabras.py <audio.wav 16k mono> <words.json (texto de referencia)> <salida.json>
Salida: [{w, t0, t1}] en segundos del archivo de origen.  DESPUÉS correr SIEMPRE scripts/verificar-sincronia.py (ver CLAUDE.md).
"""
import json, re, subprocess, sys
import numpy as np
import torch, torchaudio
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

wav, ref_json, salida = sys.argv[1:4]
MODELO = 'jonatasgrosman/wav2vec2-large-xlsr-53-spanish'
REF = [x for x in json.load(open(ref_json)) if re.search(r'\w', x['w'])]
raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', wav, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'])
audio = torch.from_numpy(np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0)
DUR = len(audio) / 16000

proc = Wav2Vec2Processor.from_pretrained(MODELO); model = Wav2Vec2ForCTC.from_pretrained(MODELO).eval()
vocab = proc.tokenizer.get_vocab()
x = (audio - audio.mean()) / (audio.std() + 1e-7)
with torch.inference_mode():
    em = torch.log_softmax(model(x[None]).logits, dim=-1)[0]            # (cuadros, vocab), 1 cuadro = 20 ms
FR = DUR / em.shape[0]

# texto → fichas (una por letra; el espacio entre palabras es '|')
def letras(w): return [c for c in re.sub(r'[^a-záéíóúñü]', '', w.lower()) if c in vocab]
tokens, dueno = [], []
for q, p in enumerate(REF):
    cs = letras(p['w'])
    if not cs: continue
    if tokens: tokens.append(vocab['|']); dueno.append(-1)
    for c in cs: tokens.append(vocab[c]); dueno.append(q)
ali, _ = torchaudio.functional.forced_align(em[None], torch.tensor([tokens], dtype=torch.int32), blank=vocab['<pad>'])
ali = ali[0].tolist()
# recorrer el camino: cada ficha ocupa los cuadros donde se emite (se colapsan repeticiones)
ini, fin, k, prev = {}, {}, -1, vocab['<pad>']
for f, tok in enumerate(ali):
    if tok != vocab['<pad>'] and tok != prev: k += 1
    if tok != vocab['<pad>']:
        q = dueno[k]
        if q >= 0: ini.setdefault(q, f); fin[q] = f
    prev = tok
t0 = [None] * len(REF); t1 = [None] * len(REF)
for q in ini: t0[q] = ini[q] * FR; t1[q] = (fin[q] + 1) * FR
for q in range(len(REF)):                                              # palabras sin letras (números...): interpolar entre vecinas
    if t0[q] is None:
        a = next((r for r in range(q - 1, -1, -1) if t1[r] is not None), None); b = next((r for r in range(q + 1, len(REF)) if t0[r] is not None), None)
        t0[q] = t1[a] if a is not None else 0.0; t1[q] = t0[b] if b is not None else DUR
for q in range(len(REF)):                                              # cada palabra dura hasta que empieza la siguiente, salvo pausa > 0,3 s
    nxt = t0[q + 1] if q + 1 < len(REF) else DUR
    t1[q] = nxt if nxt - t1[q] < 0.3 else t1[q] + 0.12
    t1[q] = max(t1[q], t0[q] + 0.05)
json.dump([{'w': REF[q]['w'], 't0': round(float(t0[q]), 3), 't1': round(float(t1[q]), 3)} for q in range(len(REF))], open(salida, 'w'), ensure_ascii=False, indent=1)
print(f'{len(REF)} palabras alineadas con {MODELO} → {salida}', file=sys.stderr)
