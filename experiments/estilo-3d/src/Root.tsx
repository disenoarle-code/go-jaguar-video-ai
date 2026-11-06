import { Composition } from 'remotion'
import { Main } from './Main'
import { DURATION_FRAMES, FPS } from './theme'

export const Root = () => (
  <Composition id="Estilo3D" component={Main} width={1920} height={1080} fps={FPS} durationInFrames={DURATION_FRAMES} />
)
