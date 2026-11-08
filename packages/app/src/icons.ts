/** Íconos 2D tipo vector (trazo blanco que hereda el color del texto). Sin emojis. */
const S = (d: string) => d   // solo para legibilidad
const P = {
  trash: S('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>'),
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  'skip-start': '<path d="M6 5v14" stroke-width="2"/><path d="M19 5.5L9 12l10 6.5z" fill="currentColor" stroke="none"/>',
  'to-start': '<path d="M5 5v14" stroke-width="2"/><path d="M13 6L5.5 12l7.5 6z" fill="currentColor" stroke="none" transform="translate(2 0)"/><path d="M21 6l-7.5 6 7.5 6z" fill="currentColor" stroke="none" transform="translate(0 0)"/>',
  'to-end': '<path d="M19 5v14" stroke-width="2"/><path d="M11 6l7.5 6-7.5 6z" fill="currentColor" stroke="none" transform="translate(-2 0)"/><path d="M3 6l7.5 6L3 18z" fill="currentColor" stroke="none"/>',
  fullscreen: S('<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>'),
  'skip-end': '<path d="M18 5v14" stroke-width="2"/><path d="M5 5.5L15 12 5 18.5z" fill="currentColor" stroke="none"/>',
  'rewind': '<path d="M12 6L3 12l9 6z" fill="currentColor" stroke="none"/><path d="M21 6l-9 6 9 6z" fill="currentColor" stroke="none"/>',
  'forward': '<path d="M12 6l9 6-9 6z" fill="currentColor" stroke="none"/><path d="M3 6l9 6-9 6z" fill="currentColor" stroke="none"/>',
  undo: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: S('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  scissors: S('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>'),
  // cortar / borrar lo anterior / borrar lo posterior (corchetes ][ ; la mitad que se borra va tenue)
  split: S('<path d="M9 5H6v14h3"/><path d="M15 5h3v14h-3"/>'),
  'trim-left': S('<g opacity=".35"><path d="M9 5H6v14h3"/></g><path d="M15 5h3v14h-3"/><path d="M3 12h2"/>'),
  'trim-right': S('<path d="M9 5H6v14h3"/><g opacity=".35"><path d="M15 5h3v14h-3"/></g><path d="M19 12h2"/>'),
  download: S('<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>'),
  text: S('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'),
  graphic: S('<path d="M12 3l2.4 5.6 6 .6-4.5 4 1.4 5.9L12 16l-5.3 3.1 1.4-5.9-4.5-4 6-.6z"/>'),
  fit: S('<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>'),
  'zoom-in': S('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/><path d="M8.5 11h5M11 8.5v5"/>'),
  'zoom-out': S('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/><path d="M8.5 11h5"/>'),
  panel: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  save: S('<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  minus: S('<path d="M5 12h14"/>'),
  warning: S('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  check: S('<path d="M4 12.5l5 5L20 6.5"/>'),
  x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  circle: S('<circle cx="12" cy="12" r="8"/>'),
  loader: S('<path d="M12 3a9 9 0 1 0 9 9"/>'),
  'arrow-left': S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  'arrow-right': S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
} as const
export type IconName = keyof typeof P

export const ico = (n: IconName) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`

/** Pone el ícono al inicio de cada elemento con data-ico="nombre". */
export function applyIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-ico]').forEach(el => {
    if (!el.querySelector(':scope > svg.ico')) el.insertAdjacentHTML('afterbegin', ico(el.dataset.ico as IconName))
  })
}
