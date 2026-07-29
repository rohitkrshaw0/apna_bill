// Shared <dialog> lifecycle: open/autofocus, backdrop-click-to-close, and a
// Promise-returning ask() for pick/confirm flows that must settle EXACTLY
// ONCE no matter how the dialog is dismissed (a resolving button, Esc,
// backdrop click, or a programmatic close() elsewhere).
//
// This closes the chooseBatch()/chooseBatchTemplate() Esc-hang defect found
// during the Milestone 13A UX audit: that code resolved its Promise only
// from click handlers registered with {once:true}, so pressing Esc closed
// the native <dialog> without ever settling the Promise, and the stale
// {once:true} listeners stayed attached to cross-resolve the NEXT call.
// Native <dialog> always fires exactly one 'close' event as the terminal
// step of every dismissal path (a resolving click that calls close(),
// Esc -> 'cancel' -> 'close', or a backdrop click that also calls close())
// -- so listening for 'close' once, registered fresh per ask() and removed
// the instant it fires, is sufficient to guarantee single settlement with
// no leaked listeners, unlike the old per-button pattern.
//
// Does not replace any of the 19 existing hand-wired dialogs in the app --
// they continue to work exactly as before. This module is opt-in per
// dialog: wrap a <dialog> element with createDialog() to get the lifecycle
// guarantees; unwrapped dialogs are unaffected.

export function createDialog (dialogEl, { closeOnBackdrop = true, autofocus } = {}) {
  let backdropHandler = null;
  let pendingValue;

  function attachBackdropClose () {
    if (!closeOnBackdrop || backdropHandler) return;
    backdropHandler = (e) => {
      // Standard cross-browser backdrop-click test: a native <dialog> has
      // no exploitable "click landed on the dialog element but outside its
      // content" gap when (as here) the dialog itself carries no padding
      // of its own (css/shared.css's base `dialog` rule sets padding: 0;
      // all padding lives on the .sheet child) -- so target-equality alone
      // is unreliable. Comparing the pointer position against the dialog's
      // own rendered box is the documented, reliable test.
      const r = dialogEl.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right ||
                       e.clientY < r.top || e.clientY > r.bottom;
      if (outside) dialogEl.close();
    };
    dialogEl.addEventListener('click', backdropHandler);
  }

  function open () {
    attachBackdropClose();
    if (!dialogEl.open) dialogEl.showModal();
    const target = typeof autofocus === 'string' ? dialogEl.querySelector(autofocus) : autofocus;
    target?.focus();
  }

  function close (returnValue) {
    if (dialogEl.open) dialogEl.close(returnValue);
  }

  // ask(): opens the dialog and returns a Promise settled by whichever
  // dismissal happens. Callers wire each resolving action (a row click, a
  // Skip button, a Cancel button) to resolveAsk(value) instead of calling
  // dialogEl.close() directly; Esc and a backdrop click resolve with
  // whatever value was last set via resolveAsk (undefined if none), which
  // callers should treat the same as an explicit Cancel.
  function ask () {
    open();
    pendingValue = undefined;
    return new Promise((resolve) => {
      const onClose = () => {
        dialogEl.removeEventListener('close', onClose);
        resolve(pendingValue);
        pendingValue = undefined;
      };
      dialogEl.addEventListener('close', onClose);
    });
  }

  function resolveAsk (value) {
    pendingValue = value;
    close();
  }

  return { open, close, ask, resolveAsk, dialogEl };
}
