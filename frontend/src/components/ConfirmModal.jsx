import { useEffect, useId, useRef } from 'react';
import Button from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible confirmation dialog (replaces window.confirm).
 * Controlled via ConfirmProvider / useConfirm().
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const panel = panelRef.current;
    const focusables = panel ? Array.from(panel.querySelectorAll(FOCUSABLE)) : [];
    const first = focusables[0];
    // Prefer cancel for destructive actions so Enter doesn't accidentally confirm
    const cancelBtn = focusables.find((el) => el.getAttribute('data-confirm-cancel') === 'true');
    (cancelBtn || first)?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel?.();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE));
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus();
      }
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmVariant = variant === 'danger' ? 'danger' : 'primary';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/40 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-5 shadow-lg sm:p-6"
      >
        <h2 id={titleId} className="font-display text-lg font-bold text-ink-900">
          {title}
        </h2>
        {typeof message === 'string' ? (
          <p id={descId} className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
            {message}
          </p>
        ) : (
          <div id={descId} className="mt-2 text-sm leading-relaxed text-ink-600">
            {message}
          </div>
        )}
        <div className="mt-6 flex flex-wrap-reverse justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            data-confirm-cancel="true"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
