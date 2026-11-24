/**
 * Fecha uma janela/modal ao clicar em qualquer lugar fora dela
 * (incluindo outras janelas do módulo ou a janela principal).
 * Faz limpeza automática quando o elemento sai do DOM ou quando `cleanup()` é chamado.
 */
export function bindCloseOnOutsideClick(el, onClose) {
  if (!el || typeof onClose !== "function") return () => {};

  let active = true;
  let armed = false;

  const cleanup = () => {
    if (!active) return;
    active = false;
    document.removeEventListener("mousedown", onDocMouseDown, true);
  };

  const onDocMouseDown = (ev) => {
    if (!active) return;
    if (!el.isConnected) {
      cleanup();
      return;
    }
    if (!armed) return;
    if (el.contains(ev.target)) return;

    // Não fecha ao clicar em menus ou popovers auxiliares ancorados na tela
    if (
      ev.target.closest?.(
        "#fk-dropdown-menu, .fk-dropdown-menu, .fk-note-link-picker, .fk-mention-picker"
      )
    ) {
      return;
    }

    cleanup();
    onClose();
  };

  document.addEventListener("mousedown", onDocMouseDown, true);
  setTimeout(() => {
    armed = true;
  }, 40);

  return cleanup;
}