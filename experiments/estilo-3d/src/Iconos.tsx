import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

/** Iconos minimalistas animados sobre fondo TRANSPARENTE (entrada: fade + escala con resorte; salida: fade). Todo por parámetros. */
export interface IconosProps {
  items: { icono: string; etiqueta?: string }[]   // icono = archivo dentro de public/assets (p. ej. "tabler-perfume.svg", bajado con assets.py)
  disposicion?: 'columna' | 'fila'
  escalonado?: number       // segundos entre la entrada de cada icono
  tamano?: number           // px del icono
  texto?: number            // px de la etiqueta
  duracion?: number
  ancho?: number; alto?: number
}
export const ICONOS_DEFAULTS = { disposicion: 'columna', escalonado: 1, tamano: 380, texto: 64, duracion: 5, ancho: 1080, alto: 1920 } as const

const Item = ({ src, etiqueta, desde, x, y, tamano, texto }: { src: string; etiqueta?: string; desde: number; x: number; y: number; tamano: number; texto: number }) => {
  const f = useCurrentFrame(), { fps, durationInFrames } = useVideoConfig()
  const k = spring({ frame: f - desde, fps, config: { damping: 12, stiffness: 120 } })
  const op = interpolate(f, [desde, desde + 12, durationInFrames - 15, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${0.4 + 0.6 * k})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: texto * 0.4, opacity: op }}>
      <Img src={staticFile('assets/' + src)} style={{ width: tamano, height: tamano }} />
      {etiqueta ? <div style={{ color: '#fff', fontFamily: 'Arial Black, Helvetica, sans-serif', fontSize: texto, textShadow: '0 4px 20px rgba(0,0,0,.6)', whiteSpace: 'nowrap' }}>{etiqueta}</div> : null}
    </div>
  )
}

export const Iconos = (p: IconosProps) => {
  const o = { ...ICONOS_DEFAULTS, ...p }, { fps, width, height } = useVideoConfig(), n = o.items.length
  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      {o.items.map((it, i) => {
        const fila = o.disposicion === 'fila'
        return <Item key={i} src={it.icono} etiqueta={it.etiqueta} desde={Math.round(6 + i * o.escalonado * fps)} tamano={o.tamano} texto={o.texto}
          x={fila ? (width * (i + 0.5)) / n : width / 2} y={fila ? height / 2 : (height * (i + 0.5)) / n} />
      })}
    </AbsoluteFill>
  )
}
