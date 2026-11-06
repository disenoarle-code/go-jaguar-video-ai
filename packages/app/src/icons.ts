/** Íconos 2D tipo vector (trazo blanco que hereda el color del texto). Sin emojis. */
const S = (d: string) => d   // solo para legibilidad
const P = {
  trash: S('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>'),
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  undo: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: S('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  scissors: S('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>'),
  save: S('<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  minus: S('<path d="M5 12h14"/>'),
  warning: S('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  check: S('<path d="M4 12.5l5 5L20 6.5"/>'),
  x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  circle: S('<circle cx="12" cy="12" r="8"/>'),
  loader: S('<path d="M12 3a9 9 0 1 0 9 9"/>'),
  'arrow-left': S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
} as const
export type IconName = keyof typeof P

export const ico = (n: IconName) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`

/** Pone el ícono al inicio de cada elemento con data-ico="nombre". */
export function applyIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-ico]').forEach(el => {
    if (!el.querySelector(':scope > svg.ico')) el.insertAdjacentHTML('afterbegin', ico(el.dataset.ico as IconName))
  })
}
