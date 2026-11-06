import '@react-three/fiber'
import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { ThreeCanvas } from '@remotion/three'
import { useCurrentFrame } from 'remotion'
import { useLife } from './life'
import { colorAt } from './theme'
import { textTexture } from './tex'

/** Contenedor: entra volando desde el costado con rebote, flota y sale encogiéndose. */
function Pop({ t0, t1, x, y, s = 1, children }: { t0: number; t1: number; x: number; y: number; s?: number; children: ReactNode }) {
  const { visible, pop, k, t } = useLife(t0, t1)
  if (!visible) return null
  const fly = (1 - Math.min(pop, 1)) * (x < 0 ? -3.2 : 3.2)
  return (
    <group position={[x + fly, y + Math.sin(t * 2.1) * 0.14, 0]} scale={s * k} rotation={[0, Math.sin(t * 1.3) * 0.25, 0]}>
      {children}
    </group>
  )
}

const tagShape = (() => {
  const s = new THREE.Shape()
  s.moveTo(-1.5, 0); s.lineTo(-0.9, 0.8); s.lineTo(1.5, 0.8); s.lineTo(1.5, -0.8); s.lineTo(-0.9, -0.8); s.closePath()
  const h = new THREE.Path(); h.absarc(-0.85, 0, 0.14, 0, Math.PI * 2, true); s.holes.push(h)
  return s
})()

function Tag({ text, color, t0 }: { text: string; color: string; t0: number }) {
  const frame = useCurrentFrame()
  const swing = Math.sin((frame - t0 * 30) / 30 * 3.2) * 0.22
  const tex = textTexture(text, { fill: '#ffffff', stroke: 'rgba(0,0,0,.35)', w: 768, h: 320 })
  return (
    <group rotation={[0, 0, swing]}>
      <mesh position={[0, 0, -0.08]}>
        <extrudeGeometry args={[tagShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 }]} />
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.35} />
      </mesh>
      <mesh position={[0.28, 0, 0.14]}><planeGeometry args={[2.3, 0.95]} /><meshBasicMaterial map={tex} transparent /></mesh>
    </group>
  )
}

function Coin({ text, color = '#ffc933', t0, spin = 5 }: { text: string; color?: string; t0: number; spin?: number }) {
  const frame = useCurrentFrame()
  const t = (frame - t0 * 30) / 30
  const tex = textTexture(text, { fill: '#7a4b00', stroke: '#fff3b0', w: 512, h: 512 })
  return (
    <group rotation={[0.25, t * spin, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.15, 1.15, 0.22, 56]} />
        <meshStandardMaterial color={color} metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0, 0.115]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial map={tex} transparent /></mesh>
      <mesh position={[0, 0, -0.115]} rotation={[0, Math.PI, 0]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial map={tex} transparent /></mesh>
    </group>
  )
}

function Flag({ t0 }: { t0: number }) {
  const frame = useCurrentFrame()
  const t = (frame - t0 * 30) / 30
  const geo = useMemo(() => new THREE.PlaneGeometry(3.6, 2.4, 40, 26), [])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo])
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1]
    pos.setZ(i, Math.sin(x * 2.2 - t * 7) * 0.17 * ((x + 1.8) / 3.6) + Math.sin(y * 3 - t * 5) * 0.04)
  }
  pos.needsUpdate = true; geo.computeVertexNormals()
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400
    const g = c.getContext('2d')!
    g.fillStyle = '#ffd100'; g.fillRect(0, 0, 600, 200)
    g.fillStyle = '#0038a8'; g.fillRect(0, 200, 600, 100)
    g.fillStyle = '#ce1126'; g.fillRect(0, 300, 600, 100)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  }, [])
  return (
    <group position={[0.2, 0, 0]}>
      <mesh geometry={geo}><meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.7} /></mesh>
      <mesh position={[-1.85, -0.9, 0]}><cylinderGeometry args={[0.06, 0.06, 4, 12]} /><meshStandardMaterial color="#d9d9e8" metalness={0.8} roughness={0.25} /></mesh>
    </group>
  )
}

function BoardAndKnife({ t0 }: { t0: number }) {
  const frame = useCurrentFrame()
  const t = (frame - t0 * 30) / 30
  return (
    <group>
      {/* tabla: gira despacio, con vetas claras */}
      <group rotation={[0.7, 0.35 + Math.sin(t * 1.2) * 0.35, 0.1]}>
        <mesh><boxGeometry args={[3.4, 0.3, 2.2]} /><meshStandardMaterial color="#c18a52" roughness={0.75} /></mesh>
        <mesh position={[0, 0.16, 0]}><boxGeometry args={[3.2, 0.02, 2.0]} /><meshStandardMaterial color="#d9a46e" roughness={0.8} /></mesh>
        <mesh position={[1.45, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.13, 0.13, 0.05, 24]} /><meshStandardMaterial color="#2a1a0c" /></mesh>
      </group>
      {/* cuchillo: hoja plana de cara a la cámara, "picando" sobre la tabla */}
      <group position={[0.1, 1.1 + Math.sin(t * 5) * 0.1, 0.9]} rotation={[0, 0, -0.55 + Math.sin(t * 5) * 0.12]}>
        <mesh position={[0.35, 0, 0]}><boxGeometry args={[2.1, 0.55, 0.06]} /><meshStandardMaterial color="#f0f3fa" metalness={0.9} roughness={0.2} /></mesh>
        <mesh position={[-1.1, 0.08, 0]}><boxGeometry args={[1.0, 0.2, 0.22]} /><meshStandardMaterial color="#1b1b22" roughness={0.45} /></mesh>
      </group>
    </group>
  )
}

function ArrowChart({ t0 }: { t0: number }) {
  const { frame } = useLife(t0, 99)
  const bars = [0.8, 1.4, 2.0, 2.8]
  return (
    <group>
      {bars.map((h, i) => {
        const grow = Math.min(1, Math.max(0, (frame - t0 * 30 - i * 5) / 12))
        const hh = Math.max(h * grow, 0.001)
        return (
          <mesh key={i} position={[-1.2 + i * 0.8, -1.4 + hh / 2, 0]}>
            <boxGeometry args={[0.55, hh, 0.55]} />
            <meshStandardMaterial color={['#ffb347', '#ff8a3c', '#ff5a36', '#ff2a2a'][i]} emissive={['#ffb347', '#ff8a3c', '#ff5a36', '#ff2a2a'][i]} emissiveIntensity={0.45} roughness={0.35} />
          </mesh>
        )
      })}
      <group position={[0.55, 1.9, 0]} rotation={[0, 0, -0.5]}>
        <mesh position={[0, -0.55, 0]}><cylinderGeometry args={[0.12, 0.12, 1.3, 16]} /><meshStandardMaterial color="#ff2a2a" emissive="#ff2a2a" emissiveIntensity={0.6} /></mesh>
        <mesh position={[0, 0.25, 0]}><coneGeometry args={[0.38, 0.7, 24]} /><meshStandardMaterial color="#ff2a2a" emissive="#ff2a2a" emissiveIntensity={0.6} /></mesh>
      </group>
    </group>
  )
}

function Lock({ t0 }: { t0: number }) {
  const frame = useCurrentFrame()
  const t = (frame - t0 * 30) / 30
  const pulse = 1 + Math.max(0, Math.sin(t * 6)) * 0.06
  return (
    <group scale={pulse} rotation={[0, 0, Math.sin(t * 2.5) * 0.06]}>
      <mesh position={[0, 0.78, 0]}><torusGeometry args={[0.52, 0.13, 20, 40, Math.PI]} /><meshStandardMaterial color="#e6e8f2" metalness={0.95} roughness={0.2} /></mesh>
      <mesh><boxGeometry args={[1.7, 1.25, 0.6]} /><meshStandardMaterial color="#ffcc33" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[0, 0.1, 0.31]}><circleGeometry args={[0.16, 24]} /><meshBasicMaterial color="#3a2600" /></mesh>
      <mesh position={[0, -0.18, 0.31]}><planeGeometry args={[0.1, 0.34]} /><meshBasicMaterial color="#3a2600" /></mesh>
    </group>
  )
}

function Knot({ t0 }: { t0: number }) {
  const frame = useCurrentFrame()
  const t = (frame - t0 * 30) / 30
  return (
    <mesh rotation={[t * 0.8, t * 1.1, 0]}>
      <torusKnotGeometry args={[0.95, 0.3, 160, 18]} />
      <meshStandardMaterial color="#b46bff" emissive="#7a3cff" emissiveIntensity={0.7} metalness={0.5} roughness={0.25} />
    </mesh>
  )
}

/** Coin que cae y se apaga cuando aparece el precio nuevo. */
function Falling({ t0, tFall, children }: { t0: number; tFall: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const f = Math.max(0, (frame - tFall * 30) / 30)
  return <group position={[0, -f * f * 9, 0]} rotation={[0, 0, f * 1.4]} scale={Math.max(0, 1 - f * 0.9)}>{children}</group>
}

export function Back3D() {
  const frame = useCurrentFrame()
  const accent = colorAt(frame, 'accent')
  return (
    <ThreeCanvas width={1920} height={1080} camera={{ position: [0, 0, 10], fov: 40 }} style={{ position: 'absolute', inset: 0 }}>
      <ambientLight intensity={1.3} />
      <directionalLight position={[4, 6, 8]} intensity={3.4} />
      <pointLight position={[-6, 2, 5]} intensity={90} color={accent} />
      <pointLight position={[6, -2, 5]} intensity={60} color="#ffffff" />

      <Pop t0={2.8} t1={6.3} x={-4.1} y={0.5} s={1.0}><Tag text="PRECIO" color="#ff2e9a" t0={2.8} /></Pop>
      <Pop t0={6.4} t1={8.4} x={4.1} y={0.5} s={1.15}><Coin text="$60" t0={6.4} /></Pop>
      <Pop t0={8.3} t1={10.9} x={-4.1} y={0.3} s={1.0}><Tag text="% OFF" color="#ff4d6d" t0={8.3} /></Pop>
      <Pop t0={10.9} t1={13.3} x={-4.3} y={0.2} s={0.95}><Falling t0={10.9} tFall={11.7}><Coin text="$50" color="#9aa0b0" t0={10.9} /></Falling></Pop>
      <Pop t0={11.7} t1={13.3} x={4.0} y={0.4} s={1.3}><Coin text="$45" color="#35e59a" t0={11.7} spin={4} /></Pop>
      <Pop t0={13.4} t1={15.9} x={4.0} y={0.3} s={0.95}><Flag t0={13.4} /></Pop>
      <Pop t0={16.3} t1={18.9} x={-4.1} y={0.2} s={0.95}><BoardAndKnife t0={16.3} /></Pop>
      <Pop t0={18.9} t1={21.5} x={4.1} y={-0.1} s={0.95}><ArrowChart t0={18.9} /></Pop>
      <Pop t0={21.6} t1={25.4} x={-4.2} y={0.4} s={0.95}><Knot t0={21.6} /></Pop>
      <Pop t0={26.0} t1={27.78} x={-4.1} y={0.3} s={1.0}><Tag text="NO" color="#ff2a2a" t0={26.0} /></Pop>
      <Pop t0={25.5} t1={27.78} x={4.1} y={0.1} s={1.1}><Lock t0={25.5} /></Pop>
    </ThreeCanvas>
  )
}
