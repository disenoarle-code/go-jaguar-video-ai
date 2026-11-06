/** Tamaño del lienzo de la vista previa: sigue el formato del proyecto (vertical 9:16, horizontal 16:9…). */
export let W = 1280, H = 720
export function setCanvasSize(format: { width: number; height: number }) {
  const r = format.width / format.height
  if (r < 1) { H = 960; W = Math.round(960 * r) } else { W = 1280; H = Math.round(1280 / r) }
}
