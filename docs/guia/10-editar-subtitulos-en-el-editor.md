## Editar subtítulos en el editor

Con un subtítulo seleccionado, el panel derecho tiene dos pestañas: **Ajustes** y **Subtítulos** (lista con una fila por subtítulo: tiempo + texto editable; Enter/↑/↓ pasan de fila; ✕ borra; clic en el tiempo va a ese punto). Cambiar `text` de un karaoke rehace sus `props.palabras` con `sincronizarPalabras` (core): las palabras que no cambian conservan su tiempo. Por eso `update_layer {patch:{text}}` también funciona por comando.
