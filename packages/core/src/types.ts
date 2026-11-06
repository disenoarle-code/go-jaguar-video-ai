/** Versión actual del formato de archivo .gojaguar. Súbela al cambiar el esquema y añade una migración. */
export const PROJECT_VERSION = 2

export interface Format { width: number; height: number; fps: number }

export interface AssetInfo {
  id: string
  name: string
  kind?: 'video' | 'image' | 'audio'
  proxy: string       // copia liviana para editar (ruta relativa a media/)
  original: string    // archivo original
  duration: number    // segundos
  fps: number
  width: number
  height: number
}

/** Zoom: un EFECTO del clip. `push` se acerca, `pull` se aleja (durante todo el clip), `punch` entra con un golpe de zoom y se asienta. */
export type ZoomKind = 'push' | 'pull' | 'punch'
export const ZOOM_KINDS: ZoomKind[] = ['push', 'pull', 'punch']
export interface ZoomFx { kind: ZoomKind; amount: number; duration?: number }   // amount: cuánto zoom (0,14 = 14 %); duration: solo punch

/**
 * Transición: vive en el CORTE entre dos clips. Se guarda en el clip que entra, pero es una sola:
 * la mitad de su duración ocurre al final del clip anterior (salida) y la otra mitad al inicio del siguiente (entrada).
 */
export type TransitionKind = 'slide' | 'flash' | 'dip'
export const TRANSITION_KINDS: TransitionKind[] = ['slide', 'flash', 'dip']
export interface Transition { kind: TransitionKind; duration: number; intensity: number; dir?: 1 | -1 }

/** Tramo de un archivo fuente en la pista principal (magnética: sin huecos). */
export interface Clip {
  id: string
  assetId: string
  srcIn: number; srcOut: number   // segundos del archivo fuente
  speed: number; volume: number
  zoom?: ZoomFx
  transition?: Transition        // la del corte ANTES de este clip (entrada de este y salida del anterior)
}

/** Pista de música: un archivo de audio que suena desde el inicio de la línea de tiempo. */
export interface Music { assetId: string; srcIn: number; volume: number; fadeOut: number }

/** Posición y apariencia de una capa. x,y = centro normalizado (0..1). */
export interface Transform {
  x: number; y: number
  scale: number
  rotation: number     // grados (eje Z)
  opacity: number      // 0..1
}

/** Valor animado: `t` en segundos desde el inicio de la capa. */
export interface Keyframe { t: number; props: Partial<Transform> }

interface LayerBase {
  id: string
  start: number; end: number    // segundos de la línea de tiempo
  transform: Transform
  keyframes?: Keyframe[]        // reservado: aún no se renderiza
}

export interface SubtitleLayer extends LayerBase { type: 'subtitle'; text: string; size: number; color: string }
/** Gráfico. `template` 'lowerthird' (barra con texto) o 'lanzamiento' (rótulo animado de lanzamiento; sus textos e imagen van en `props`). */
export interface GraphicLayer extends LayerBase { type: 'graphic'; template: string; text: string; size: number; color: string; props?: Record<string, string> }
/** Reservados para etapas posteriores (el modelo ya los soporta; aún no se dibujan). */
export interface ImageLayer extends LayerBase { type: 'image'; assetId: string }
export interface Scene3DLayer extends LayerBase { type: 'scene3d'; template: string; params: Record<string, unknown> }
export interface CutoutLayer extends LayerBase { type: 'cutout'; clipId: string; model: string }

export type Layer = SubtitleLayer | GraphicLayer | ImageLayer | Scene3DLayer | CutoutLayer
export type TextLayer = SubtitleLayer | GraphicLayer
export type LayerType = Layer['type']

export const isTextLayer = (l: Layer): l is TextLayer => l.type === 'subtitle' || l.type === 'graphic'

/**
 * Clip superpuesto, colocado libremente en el tiempo (a diferencia de la pista principal, que es magnética).
 * `track` 1, 2, 3… numera las pistas de su tipo: pistas de video por ENCIMA de la principal y pistas de audio extra.
 * Si dos clips del mismo tipo se solapan en el tiempo, uno va a otra pista (se abre una nueva).
 */
export interface OverlayClip {
  id: string
  assetId: string
  kind: 'video' | 'audio'
  track: number
  start: number                   // segundos en la línea de tiempo
  srcIn: number; srcOut: number   // segundos del archivo fuente
  speed: number; volume: number
  transform: Transform            // posición/tamaño/opacidad (solo video)
  blend?: 'screen'                // 'screen' suma la luz del clip al video de abajo (luces, destellos, humo): lo negro no se ve
}

/** Estado de una pista de la línea de tiempo. Claves: 'main', 'music', 'subtitle', 'graphic', 'v1','v2'… (video superpuesto) y 'a1','a2'… (audio extra). */
export interface TrackState { locked?: boolean; hidden?: boolean; muted?: boolean }

export interface Project {
  version: number
  name: string
  format: Format
  assets: AssetInfo[]
  clips: Clip[]
  layers: Layer[]
  music?: Music
  overlays?: OverlayClip[]
  tracks?: Record<string, TrackState>
  nextId: number
}

export function createProject(name = 'Proyecto sin título', format: Format = { width: 1280, height: 720, fps: 30 }): Project {
  return { version: PROJECT_VERSION, name, format, assets: [], clips: [], layers: [], nextId: 1 }
}

export const DEFAULT_TRANSFORM: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }
