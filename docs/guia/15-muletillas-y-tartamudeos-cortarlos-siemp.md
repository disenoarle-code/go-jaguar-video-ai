## Muletillas y tartamudeos (cortarlos siempre)

`scripts/detectar-muletillas.py <audio.wav> <palabras.json>` encuentra los "eeeh/mmm" (sonidos con voz de tono plano entre palabras, que Whisper no escribe), palabras repetidas, arranques en falso y muletillas de relleno. Úsalo en TODA edición y decide con criterio: se quita lo que es relleno, se deja lo que lleva sentido o énfasis. Después, transcribir el audio final y revisar.
