/** Versión actual del formato de archivo .gojaguar. Súbela al cambiar el esquema y añade una migración. */
export const PROJECT_VERSION = 1

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

/** Efecto de movimiento/transición de un clip (ver fx.ts). */
export type ClipFx = 'push' | 'punch' | 'slide' | 'punchflash' | 'dropflash'
export const CLIP_FX: ClipFx[] = ['push', 'punch', 'slide', 'punchflash', 'dropflash']

/** Tramo de un archivo fuente en la pista principal (magnética: sin huecos). */
export interface Clip {
  id: string
  assetId: string
  srcIn: number; srcOut: number   // segundos del archivo fuente
  speed: number; volume: number
  fx?: ClipFx; fxDir?: 1 | -1
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
export interface GraphicLayer extends LayerBase { type: 'graphic'; template: string; text: string; size: number; color: string }
/** Reservados para etapas posteriores (el modelo ya los soporta; aún no se dibujan). */
export interface ImageLayer extends LayerBase { type: 'image'; assetId: string }
export interface Scene3DLayer extends LayerBase { type: 'scene3d'; template: string; params: Record<string, unknown> }
export interface CutoutLayer extends LayerBase { type: 'cutout'; clipId: string; model: string }

export type Layer = SubtitleLayer | GraphicLayer | ImageLayer | Scene3DLayer | CutoutLayer
export type TextLayer = SubtitleLayer | GraphicLayer
export type LayerType = Layer['type']

export const isTextLayer = (l: Layer): l is TextLayer => l.type === 'subtitle' || l.type === 'graphic'

export interface Project {
  version: number
  name: string
  format: Format
  assets: AssetInfo[]
  clips: Clip[]
  layers: Layer[]
  music?: Music
  nextId: number
}

export function createProject(name = 'Proyecto sin título', format: Format = { width: 1280, height: 720, fps: 30 }): Project {
  return { version: PROJECT_VERSION, name, format, assets: [], clips: [], layers: [], nextId: 1 }
}

export const DEFAULT_TRANSFORM: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }
