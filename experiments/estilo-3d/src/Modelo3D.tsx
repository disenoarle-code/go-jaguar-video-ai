import '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { ThreeCanvas } from '@remotion/three'
import { AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { useThree } from '@react-three/fiber'

/** Parámetros (todo lo que cambia entre usos; NO se escribe código nuevo por video). */
export interface Modelo3DProps {
  modelo: string            // ruta dentro de public/, p. ej. "assets/modelos/painted_wooden_chair_01/painted_wooden_chair_01.gltf"
  movimiento?: 'giro' | 'giro1' | 'balanceo' | 'quieto'   // giro continuo · una vuelta completa en la duración · vaivén · sin movimiento
  velocidad?: number        // vueltas por segundo para 'giro' (0.15 = suave)
  distancia?: number        // cámara (en tamaños del objeto; menor = más cerca)
  elevacion?: number        // grados sobre el horizonte
  fov?: number
  hdri?: string | null      // ruta en public/ de un .hdr de Poly Haven para reflejos/luz; null = luces simples
  sombra?: boolean          // sombra suave bajo el objeto
  entrada?: 'pop' | 'fade' | 'ninguna'
  duracion?: number         // segundos
  ancho?: number; alto?: number
}
export const MODELO3D_DEFAULTS: Required<Modelo3DProps> = { modelo: '', movimiento: 'giro', velocidad: 0.18, distancia: 2.6, elevacion: 14, fov: 35, hdri: null, sombra: true, entrada: 'pop', duracion: 4, ancho: 1080, alto: 1080 }

function useGltf(url: string) {
  const [h] = useState(() => delayRender('gltf ' + url)); const [g, setG] = useState<THREE.Object3D | null>(null)
  useEffect(() => { new GLTFLoader().load(url, x => { setG(x.scene); continueRender(h) }, undefined, e => cancelRender(e)) }, [url, h])
  return g
}

function Entorno({ hdri }: { hdri: string }) {
  const { gl, scene } = useThree(); const [h] = useState(() => delayRender('hdri'))
  useEffect(() => {
    new RGBELoader().load(staticFile(hdri), tex => { const p = new THREE.PMREMGenerator(gl); scene.environment = p.fromEquirectangular(tex).texture; tex.dispose(); p.dispose(); continueRender(h) }, undefined, e => cancelRender(e))
  }, [hdri, gl, scene, h])
  return null
}

const Sombra = ({ y, r }: { y: number; r: number }) => {
  const tex = useMemo(() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!; const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c) }, [])
  return <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[r * 2.6, r * 2.6]} /><meshBasicMaterial map={tex} transparent depthWrite={false} /></mesh>
}

export const Modelo3D = (p: Modelo3DProps) => {
  const o = { ...MODELO3D_DEFAULTS, ...p }
  const f = useCurrentFrame(), { fps, width, height, durationInFrames } = useVideoConfig(), t = f / fps
  const obj = useGltf(staticFile(o.modelo))
  const fit = useMemo(() => {   // centra el objeto y lo escala a tamaño 1 (la cámara se mide en "tamaños del objeto")
    if (!obj) return null
    const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), k = 1 / Math.max(s.x, s.y, s.z, 1e-6)
    return { k, c, alto: s.y * k, ancho: Math.max(s.x, s.z) * k }
  }, [obj])
  const ent = o.entrada === 'ninguna' ? 1 : spring({ frame: f, fps, config: { damping: 14, stiffness: 110 } })
  const sal = interpolate(f, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  const rotY = o.movimiento === 'giro' ? t * o.velocidad * Math.PI * 2 : o.movimiento === 'giro1' ? (t / o.duracion) * Math.PI * 2 : o.movimiento === 'balanceo' ? Math.sin(t * 1.6) * 0.6 : 0
  const esc = (o.entrada === 'pop' ? 0.5 + 0.5 * ent : 1) * (o.entrada === 'ninguna' ? 1 : 0.85 + 0.15 * sal)
  const el = (o.elevacion * Math.PI) / 180, d = o.distancia
  return (
    <AbsoluteFill style={{ background: 'transparent', opacity: o.entrada === 'ninguna' ? 1 : Math.min(ent, sal) }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, Math.sin(el) * d, Math.cos(el) * d], fov: o.fov, near: 0.01, far: 100 }} gl={{ alpha: true, antialias: true }} style={{ background: 'transparent' }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
        <ambientLight intensity={o.hdri ? 0.2 : 0.8} /><directionalLight position={[2, 4, 3]} intensity={o.hdri ? 0.8 : 2.2} />
        {o.hdri ? <Entorno hdri={o.hdri} /> : null}
        {obj && fit ? (
          <group scale={esc}>
            <group rotation={[0, rotY, 0]}><group scale={fit.k}><primitive object={obj} position={[-fit.c.x, -fit.c.y, -fit.c.z]} /></group></group>
            {o.sombra ? <Sombra y={-fit.alto / 2 - 0.01} r={fit.ancho / 2} /> : null}
          </group>
        ) : null}
      </ThreeCanvas>
    </AbsoluteFill>
  )
}
