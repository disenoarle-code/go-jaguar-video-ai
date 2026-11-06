import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, random, staticFile, useCurrentFrame } from 'remotion'
import words from '../public/words.json'
import { Back3D } from './Back3D'
import { Front3D } from './Front3D'
import { FONT, ZOOMS, colorAt, sec, zoomAt } from './theme'

const W = 1920, H = 1080
const ORIGIN = '52% 8%'      // el zoom crece hacia abajo: la cabeza no se corta
const DROP = 150             // la persona baja un poco para dejar aire a las letras 3D arriba (y esconder el hueco de la laptop)

/** Fondo de color que reemplaza al real: degradado vivo + manchas de luz + partículas. */
function Background() {
  const f = useCurrentFrame()
  const dark = colorAt(f, 'dark'), glow = colorAt(f, 'glow'), accent = colorAt(f, 'accent')
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at ${50 + Math.sin(f / 55) * 8}% 38%, ${glow} 0%, ${dark} 72%)` }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute', width: 620, height: 620, borderRadius: '50%', background: accent, opacity: 0.3, filter: 'blur(110px)',
          left: 260 + i * 520 + Math.sin(f / (40 + i * 13) + i) * 160, top: 120 + Math.cos(f / (47 + i * 9) + i * 2) * 140,
        }} />
      ))}
      {Array.from({ length: 46 }).map((_, i) => {
        const size = 3 + random(`s${i}`) * 7, speed = 0.7 + random(`v${i}`) * 1.6
        const y = H + 30 - ((f * speed * 2.2 + random(`o${i}`) * 1300) % (H + 60))
        return <div key={i} style={{ position: 'absolute', left: random(`x${i}`) * W, top: y, width: size, height: size, borderRadius: '50%', background: '#fff', opacity: 0.18 + random(`a${i}`) * 0.4, boxShadow: `0 0 12px ${accent}` }} />
      })}
    </AbsoluteFill>
  )
}

/** Palabra por palabra, con la palabra que se dice resaltada. */
function Captions() {
  const f = useCurrentFrame()
  const t = f / 30
  const accent = colorAt(f, 'accent')
  const GROUP = 3
  const groups: typeof words[] = []
  for (let i = 0; i < words.length; i += GROUP) groups.push(words.slice(i, i + GROUP))
  const g = groups.find((gr, i) => t >= gr[0].t0 && t < (groups[i + 1]?.[0].t0 ?? 999)) ?? null
  if (!g) return null
  const idx = g.findIndex((w, i) => t >= w.t0 && t < (g[i + 1]?.t0 ?? 999))
  const enter = interpolate(f - sec(g[0].t0), [0, 4], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 62, display: 'flex', justifyContent: 'center', opacity: enter, transform: `translateY(${(1 - enter) * 24}px)` }}>
      <div style={{ display: 'flex', gap: 36, padding: '14px 44px', borderRadius: 26, background: 'rgba(8,6,20,.62)', border: `2px solid ${accent}`, boxShadow: `0 0 36px ${accent}66`, backdropFilter: 'blur(6px)' }}>
        {g.map((w, i) => {
          const on = i === idx
          return (
            <span key={i} style={{
              fontFamily: FONT, fontSize: 70, textTransform: 'uppercase', letterSpacing: 1, color: on ? accent : '#fff',
              transform: `scale(${on ? 1.08 : 1})`, textShadow: '0 4px 0 rgba(0,0,0,.55), 0 0 24px rgba(0,0,0,.6)',
            }}>{w.w.replace(/[.,]/g, '')}</span>
          )
        })}
      </div>
    </div>
  )
}

export function Main() {
  const f = useCurrentFrame()
  const { scale, shakeX, shakeY } = zoomAt(f)
  const accent = colorAt(f, 'accent')
  const reveal = interpolate(f, [sec(0.5), sec(1.5)], [0, 1700], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const bgScale = 1 + (scale - 1.1) * 0.35
  const personFrame = String(Math.min(f + 1, 832)).padStart(4, '0')

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* 1) Video original: el fondo real se disuelve y queda el recortado */}
      <OffthreadVideo src={staticFile('seg_cut.mp4')} muted />

      {/* 2) Fondo nuevo + objetos 3D, revelándose en círculo desde la persona */}
      <AbsoluteFill style={{ clipPath: `circle(${reveal}px at 52% 42%)` }}>
        <AbsoluteFill style={{ transform: `translate(${-shakeX * 0.5}px, ${-shakeY * 0.5}px) scale(${bgScale})`, transformOrigin: ORIGIN }}>
          <Background />
          <Back3D />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* 3) Persona recortada con zoom dramático, temblor y contorno de luz */}
      <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY + DROP}px) scale(${scale})`, transformOrigin: ORIGIN }}>
        <Img src={staticFile(`person/p_${personFrame}.png`)} style={{ width: W, height: H, filter: `drop-shadow(0 0 22px ${accent}) drop-shadow(0 0 60px ${accent}88)` }} />
      </AbsoluteFill>

      {/* 4) Letras 3D delante */}
      <Front3D />

      {/* 5) Subtítulos */}
      <Captions />

      {/* 6) Golpes: destello en los zooms fuertes + viñeta */}
      {ZOOMS.filter(z => z.peak >= 0.24).map((z, i) => (
        <AbsoluteFill key={i} style={{ background: '#fff', opacity: f >= sec(z.t) && f < sec(z.t) + 5 ? interpolate(f, [sec(z.t), sec(z.t) + 5], [0.28, 0]) : 0, pointerEvents: 'none' }} />
      ))}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.55) 100%)', pointerEvents: 'none' }} />

      {/* Audio: voz + efectos sintéticos en cada golpe */}
      <Audio src={staticFile('voice.wav')} />
      {ZOOMS.filter(z => z.peak >= 0.24).map((z, i) => (
        <Sequence key={i} from={Math.max(0, sec(z.t) - 4)} durationInFrames={30}>
          <Audio src={staticFile('whoosh.wav')} volume={0.32} />
        </Sequence>
      ))}
      {ZOOMS.filter(z => z.peak >= 0.24).map((z, i) => (
        <Sequence key={`h${i}`} from={sec(z.t)} durationInFrames={30}>
          <Audio src={staticFile('hit.wav')} volume={0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
