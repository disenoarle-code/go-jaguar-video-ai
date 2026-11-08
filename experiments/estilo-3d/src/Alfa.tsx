import '@react-three/fiber'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { ThreeCanvas } from '@remotion/three'

/** PRUEBA de 3D con FONDO TRANSPARENTE: un objeto 3D con volumen y sombra girando, sin fondo. Se renderiza como secuencia PNG con alfa. */
export const Alfa = ({ color = '#ffc233' }: { color?: string }) => {
  const f = useCurrentFrame(), { fps, width, height } = useVideoConfig(), t = f / fps
  const pop = Math.min(1, t / 0.5), s = 1 + (1 - pop) * 0.6 + Math.sin(pop * Math.PI) * 0.05
  return (
    <AbsoluteFill style={{ background: 'transparent' }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 8], fov: 35 }} gl={{ alpha: true, antialias: true }} style={{ background: 'transparent' }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 6]} intensity={2.2} />
        <group scale={s * pop} rotation={[0.35, t * 1.2, 0.1]}>
          <mesh><torusKnotGeometry args={[1.2, 0.4, 160, 24]} /><meshStandardMaterial color={color} metalness={0.55} roughness={0.25} /></mesh>
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  )
}
