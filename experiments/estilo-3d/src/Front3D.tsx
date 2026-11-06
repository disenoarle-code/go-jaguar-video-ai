import '@react-three/fiber'
import * as THREE from 'three'
import { ThreeCanvas } from '@remotion/three'
import { useLife } from './life'
import { colorAt, sec } from './theme'
import { textTexture } from './tex'

/** Letras con profundidad: capas apiladas en Z que giran, estilo "lettering 3D". */
function Stacked({ text, t0, t1, w, x = 0, y = 2.85 }: { text: string; t0: number; t1: number; w: number; x?: number; y?: number }) {
  const { visible, pop, k, t } = useLife(t0, t1)
  if (!visible) return null
  const accent = colorAt(sec(t0) + 4, 'accent')   // fijo por frase: la textura no se recrea en cada frame
  const h = w * 0.2
  const front = textTexture(text, { fill: '#ffffff', stroke: accent, w: 2048, h: Math.round(2048 * 0.2) })
  const back = textTexture(text, { fill: accent, w: 2048, h: Math.round(2048 * 0.2) })
  const layers = 9
  return (
    <group position={[x, y + (1 - Math.min(pop, 1)) * 1.6, 0]} scale={k} rotation={[-0.06, Math.sin(t * 1.6) * 0.2, Math.sin(t * 1.1) * 0.015]}>
      {Array.from({ length: layers }).map((_, i) => (
        <mesh key={i} position={[0, 0, -i * 0.05]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={back} transparent color={new THREE.Color().setScalar(1 - i * 0.07)} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.04]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={front} transparent /></mesh>
    </group>
  )
}

export const PHRASES = [
  { t0: 0.45, t1: 2.7,  text: 'OBJECIÓN #1',        w: 5.6 },
  { t0: 2.75, t1: 6.3,  text: 'EL PRECIO',          w: 5.4 },
  { t0: 6.4,  t1: 8.3,  text: '60 DÓLARES',         w: 6.0 },
  { t0: 8.3,  t1: 10.9, text: 'DESCUENTO',          w: 5.6 },
  { t0: 10.9, t1: 13.3, text: '$50 → $45',          w: 6.4 },
  { t0: 13.4, t1: 15.9, text: 'EN COLOMBIA',        w: 6.0 },
  { t0: 16.3, t1: 18.9, text: 'TABLA DE PICAR',     w: 6.6 },
  { t0: 18.9, t1: 21.5, text: 'TICKET ALTO',        w: 5.8 },
  { t0: 22.6, t1: 25.4, text: '¿QUÉ HACER?',        w: 5.6 },
  { t0: 25.5, t1: 27.78, text: 'NO BAJAR EL PRECIO', w: 9.6 },
]

export function Front3D() {
  return (
    <ThreeCanvas width={1920} height={1080} camera={{ position: [0, 0, 10], fov: 40 }} style={{ position: 'absolute', inset: 0 }}>
      {PHRASES.map(p => <Stacked key={p.text} {...p} />)}
    </ThreeCanvas>
  )
}
