import { useEffect, useRef, type ReactNode } from "react";

export interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(): void;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose(): void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state, onClose]);
  if (!state) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{state.title}</h2>
        <div className="modal-body">{state.body}</div>
        <div className="form-actions end">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={`btn ${state.danger ? "danger solid" : "primary"}`}
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface Toast {
  id: number;
  message: string;
  undo: boolean;
}

export function Toasts({
  toasts,
  onUndo,
  onDismiss,
}: {
  toasts: Toast[];
  onUndo(): void;
  onDismiss(id: number): void;
}) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.undo && (
            <button
              className="link"
              onClick={() => {
                onUndo();
                onDismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
          <button className="icon-btn small" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
