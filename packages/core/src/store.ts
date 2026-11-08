import type { AssetInfo, Project } from './types'

export type Selection = { type: 'clip' | 'layer' | 'overlay' | 'music'; id: string } | null
/** Un elemento de medios seleccionable en grupo (clip de la pista principal, video/audio superpuesto o música). */
export type SelItem = { type: 'clip' | 'overlay' | 'music'; id: string }

/** Estado del proyecto + historial. Sin dependencias del navegador. */
export class Store {
  project: Project
  selection: Selection = null
  /** Selección de VARIOS elementos (≥ 2): entonces `selection` es null. Ver `selectMany`. */
  multi: SelItem[] = []
  /** Último elemento que se eligió solo: es el extremo fijo de la selección por rango (Mayús + clic). */
  anchor: SelItem | null = null
  /** Sube con cada cambio: útil para autoguardado. */
  revision = 0
  private undoStack: string[] = []
  private redoStack: string[] = []
  private txBefore: string | null = null
  private listeners = new Set<() => void>()

  constructor(p: Project) { this.project = p }

  asset(id: string): AssetInfo | undefined { return this.project.assets.find(a => a.id === id) }

  onChange(fn: () => void) { this.listeners.add(fn) }
  emit() { this.revision++; this.listeners.forEach(fn => fn()) }

  private snap() { return JSON.stringify(this.project) }
  newId(prefix: string) { return `${prefix}${this.project.nextId++}` }

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }

  /** Reemplaza el proyecto completo (abrir archivo) y borra el historial. */
  load(p: Project) {
    this.project = p
    this.selection = null; this.multi = []; this.anchor = null
    this.undoStack = []; this.redoStack = []; this.txBefore = null
    this.emit()
  }

  /** Cambio atómico con una entrada de historial. */
  mutate(fn: (p: Project) => void) {
    const before = this.snap()
    fn(this.project)
    if (this.snap() !== before) {
      this.undoStack.push(before)
      this.redoStack = []
    }
    this.emit()
  }

  /** Arrastres: cambios en vivo y una sola entrada de historial al terminar. */
  beginTx() { this.txBefore = this.snap() }
  live(fn: (p: Project) => void) { fn(this.project); this.emit() }
  endTx() {
    if (this.txBefore !== null && this.txBefore !== this.snap()) {
      this.undoStack.push(this.txBefore)
      this.redoStack = []
    }
    this.txBefore = null
    this.emit()
  }

  undo() {
    const prev = this.undoStack.pop()
    if (prev === undefined) return
    this.redoStack.push(this.snap())
    this.project = JSON.parse(prev)
    this.emit()
  }
  redo() {
    const next = this.redoStack.pop()
    if (next === undefined) return
    this.undoStack.push(this.snap())
    this.project = JSON.parse(next)
    this.emit()
  }
  select(sel: Selection) {
    this.selection = sel; this.multi = []
    if (sel && sel.type !== 'layer') this.anchor = { type: sel.type, id: sel.id }
    this.emit()
  }
  /** Selecciona varios elementos a la vez (1 = selección normal, 0 = nada). */
  selectMany(items: SelItem[]) {
    if (items.length <= 1) { this.select(items[0] ?? null); return }
    this.selection = null; this.multi = items; this.emit()
  }
  /** ¿Está seleccionado este elemento (solo o dentro del grupo)? */
  isSelected(type: string, id: string) {
    return (this.selection?.type === type && this.selection.id === id) || this.multi.some(m => m.type === type && m.id === id)
  }
  /** Elementos seleccionados, sea uno o varios. */
  selectedItems(): SelItem[] {
    if (this.multi.length) return this.multi
    const s = this.selection
    return s && s.type !== 'layer' ? [{ type: s.type, id: s.id }] : []
  }
}
