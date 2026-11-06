declare module 'soundtouchjs' {
  export class SoundTouch { tempo: number }
  export class WebAudioBufferSource { constructor(buffer: unknown) }
  export class SimpleFilter {
    constructor(source: WebAudioBufferSource, pipe: SoundTouch)
    sourcePosition: number
    extract(target: Float32Array, numFrames?: number): number
  }
}
