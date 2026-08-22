import { useEffect, useRef } from 'react';

/**
 * Enter confirms / Escape cancels for any open menu, popover or modal that
 * has a Confirm / Set style action — regardless of where keyboard focus is.
 *
 * - Enter is ignored while typing in a textarea or a contenteditable (those
 *   handle their own Enter), and inside an <input> ONLY if that input has its
 *   own Enter handling (pass `skipInputs: true`).
 * - Both keys stop propagation so an outer panel's Escape-to-close does not
 *   also fire for the same keypress.
 *
 * @param {boolean} active  only listens while true (e.g. the panel is open)
 * @param {{ onConfirm?: Function, onCancel?: Function, skipInputs?: boolean }} handlers
 */
export default function useConfirmKeys(active, { onConfirm, onCancel, skipInputs = false } = {}) {
  const ref = useRef({ onConfirm, onCancel, skipInputs });
  ref.current = { onConfirm, onCancel, skipInputs };

  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      if (e.isComposing) return;
      const { onConfirm: confirm, onCancel: cancel, skipInputs: skip } = ref.current;
      const tag = e.target?.tagName;
      const inInput = tag === 'INPUT';
      const inTextEntry = tag === 'TEXTAREA' || e.target?.isContentEditable;
      if (e.key === 'Enter') {
        if (inTextEntry || (skip && inInput) || !confirm) return;
        e.preventDefault();
        e.stopPropagation();
        confirm(e);
      } else if (cancel) {
        e.preventDefault();
        e.stopPropagation();
        cancel(e);
      }
    };
    // Capture phase so this wins over window-level "Escape closes panel" listeners.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [active]);
}
