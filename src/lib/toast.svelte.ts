export type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

export const toasts = $state<Toast[]>([]);
let n = 0;

export function toast(text: string, action?: Toast['action'], ms = 7000) {
  const id = ++n;
  toasts.push({ id, text, action });
  setTimeout(() => dismiss(id), ms);
}

export function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

/** Standardmelding etter sletting, med «Angre». */
export function undoable(text: string, undo: () => void) {
  toast(text, { label: 'Angre', run: undo }, 9000);
}
