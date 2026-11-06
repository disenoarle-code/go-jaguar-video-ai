import type { AssetInfo, Project } from './types'

export type Selection = { type: 'clip' | 'layer' | 'overlay'; id: string } | null

/** Estado del proyecto + historial. Sin dependencias del navegador. */
export class Store {
  project: Project
  selection: Selection = null
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
    this.selection = null
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
  select(sel: Selection) { this.selection = sel; this.emit() }
}
