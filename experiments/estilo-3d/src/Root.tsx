import { Composition } from 'remotion'
import { Main } from './Main'
import { Alfa } from './Alfa'
import { Iconos, ICONOS_DEFAULTS } from './Iconos'
import { Modelo3D, MODELO3D_DEFAULTS } from './Modelo3D'
import { DURATION_FRAMES, FPS } from './theme'

export const Root = () => (
  <>
  {/* Composiciones PARAMETRIZADAS: tamaño y duración salen de las props (ancho, alto, duracion en segundos) */}
  <Composition id="Iconos" component={Iconos as never} width={1080} height={1920} fps={30} durationInFrames={150} defaultProps={{ items: [] }}
    calculateMetadata={({ props }: { props: any }) => ({ width: props.ancho ?? ICONOS_DEFAULTS.ancho, height: props.alto ?? ICONOS_DEFAULTS.alto, durationInFrames: Math.round((props.duracion ?? ICONOS_DEFAULTS.duracion) * 30) })} />
  <Composition id="Modelo3D" component={Modelo3D as never} width={1080} height={1080} fps={30} durationInFrames={120} defaultProps={{ modelo: '' }}
    calculateMetadata={({ props }: { props: any }) => ({ width: props.ancho ?? MODELO3D_DEFAULTS.ancho, height: props.alto ?? MODELO3D_DEFAULTS.alto, durationInFrames: Math.round((props.duracion ?? MODELO3D_DEFAULTS.duracion) * 30) })} />
  <Composition id="Alfa" component={Alfa} width={1080} height={1080} fps={30} durationInFrames={90} defaultProps={{ color: '#ffc233' }} />
  <Composition id="Estilo3D" component={Main} width={1920} height={1080} fps={FPS} durationInFrames={DURATION_FRAMES} />
  </>
)
