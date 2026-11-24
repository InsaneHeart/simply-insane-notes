export class ManagerNavigation {
  constructor(managerView) {
    this.view = managerView;
    this.app = managerView.app;
    this._autoScrollRaf = null;
    this._autoScrollState = null;
    this._fadeResizeObserver = null;
    this._stopActivePan = null;
    this._suppressNextContextMenu = false;
  }

  initObservers() {
    this.stopDragAutoScroll();
    this._stopActivePan?.();
    this._fadeResizeObserver?.disconnect();
    this._fadeResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (el.classList.contains("fk-kanban-board")) {
          this.updateHorizontalScrollFade(el);
        } else {
          this.updateVerticalScrollFade(el);
        }
      }
    });
  }

  /* ================= NAVEGAÇÃO POR ARRASTE (BOTÃO DO MEIO OU DIREITO ESTILO CANVA) ================= */

  bindManagerPanNavigation(wrapper) {
    if (!wrapper) return;

    wrapper.addEventListener(
      "contextmenu",
      (e) => {
        if (this._suppressNextContextMenu) {
          this._suppressNextContextMenu = false;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      },
      true
    );

    wrapper.addEventListener("mousedown", (e) => {
      if (e.button !== 1 && e.button !== 2) return;
      if (e.target.closest("input, textarea, select, [contenteditable='true']")) return;

      if (e.button === 1) {
        e.preventDefault();
      }

      this._stopActivePan?.();
      this.app.closeMenu();

      const startX = e.clientX;
      const startY = e.clientY;
      let lastX = e.clientX;
      let lastY = e.clientY;
      let isPanning = false;
      const panButton = e.button;

      const inSharedDrawer = Boolean(e.target.closest(".fk-shared-drawer"));
      const hContainer = inSharedDrawer ? null : wrapper.querySelector(".fk-kanban-board");

      const resolveVerticalContainer = (targetEl) => {
        const directScroll = targetEl?.closest(".fk-col-cards, .fk-folders-view-scroll");
        if (directScroll) return directScroll;
        const colEl = targetEl?.closest(".fk-column");
        if (colEl) return colEl.querySelector(".fk-col-cards");
        const drawerEl = targetEl?.closest(".fk-shared-drawer");
        if (drawerEl) return drawerEl.querySelector(".fk-col-cards");
        return wrapper.querySelector(".fk-folders-view-scroll");
      };

      let vContainer = resolveVerticalContainer(e.target);

      const stopPan = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        wrapper.removeEventListener("wheel", onWheel, true);
        wrapper.classList.remove("panning");
        this._stopActivePan = null;
      };

      const onMove = (ev) => {
        if (!isPanning) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
          isPanning = true;
          wrapper.classList.add("panning");
          if (panButton === 2) {
            this._suppressNextContextMenu = true;
          }
        }

        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;

        if (hContainer && dx !== 0) {
          hContainer.scrollLeft -= dx;
          this.updateHorizontalScrollFade(hContainer);
        }

        if (!vContainer) {
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          vContainer = resolveVerticalContainer(under);
        }

        if (vContainer && dy !== 0) {
          vContainer.scrollTop -= dy;
          this.updateVerticalScrollFade(vContainer);
        }
      };

      const onUp = (ev) => {
        const wasRightDrag = isPanning && panButton === 2;
        stopPan();
        if (wasRightDrag && ev.button === 2) {
          setTimeout(() => {
            this._suppressNextContextMenu = false;
          }, 80);
        }
      };

      const onWheel = (we) => {
        if (we.shiftKey) {
          const wasRightDrag = isPanning && panButton === 2;
          stopPan();
          if (wasRightDrag) {
            setTimeout(() => {
              this._suppressNextContextMenu = false;
            }, 80);
          }
        }
      };

      this._stopActivePan = stopPan;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      wrapper.addEventListener("wheel", onWheel, { capture: true, passive: true });
    });
  }

  /* ================= FADE OUT PROPORCIONAL E SUAVE (VERTICAL E HORIZONTAL) ================= */

  bindVerticalScrollFade(el) {
    if (!el) return;
    const update = () => this.updateVerticalScrollFade(el);
    el.addEventListener("scroll", update, { passive: true });
    this._fadeResizeObserver?.observe(el);
    requestAnimationFrame(update);
  }

  bindHorizontalScrollFade(el) {
    if (!el) return;
    const update = () => this.updateHorizontalScrollFade(el);
    el.addEventListener("scroll", update, { passive: true });
    this._fadeResizeObserver?.observe(el);
    requestAnimationFrame(update);
  }

  updateVerticalScrollFade(el) {
    if (!el) return;
    const maxFade = 28;
    const scrollTop = Math.max(0, el.scrollTop);
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const remainingBottom = Math.max(0, maxScroll - scrollTop);

    if (maxScroll <= 1) {
      el.style.webkitMaskImage = "none";
      el.style.maskImage = "none";
      return;
    }

    const tTop = Math.min(1, scrollTop / maxFade);
    const tBottom = Math.min(1, remainingBottom / maxFade);

    const topStopPx = (tTop * maxFade).toFixed(1);
    const bottomStopPx = (tBottom * maxFade).toFixed(1);
    const topEdgeAlpha = (1 - tTop).toFixed(3);
    const bottomEdgeAlpha = (1 - tBottom).toFixed(3);

    const mask = `linear-gradient(to bottom, rgba(0,0,0,${topEdgeAlpha}) 0px, #000 ${topStopPx}px, #000 calc(100% - ${bottomStopPx}px), rgba(0,0,0,${bottomEdgeAlpha}) 100%)`;
    el.style.webkitMaskImage = mask;
    el.style.maskImage = mask;
  }

  updateHorizontalScrollFade(el) {
    if (!el) return;
    const maxFade = 32;
    const scrollLeft = Math.max(0, el.scrollLeft);
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const remainingRight = Math.max(0, maxScroll - scrollLeft);

    if (maxScroll <= 1) {
      el.style.webkitMaskImage = "none";
      el.style.maskImage = "none";
      return;
    }

    const tLeft = Math.min(1, scrollLeft / maxFade);
    const tRight = Math.min(1, remainingRight / maxFade);

    const leftStopPx = (tLeft * maxFade).toFixed(1);
    const rightStopPx = (tRight * maxFade).toFixed(1);
    const leftEdgeAlpha = (1 - tLeft).toFixed(3);
    const rightEdgeAlpha = (1 - tRight).toFixed(3);

    const mask = `linear-gradient(to right, rgba(0,0,0,${leftEdgeAlpha}) 0px, #000 ${leftStopPx}px, #000 calc(100% - ${rightStopPx}px), rgba(0,0,0,${rightEdgeAlpha}) 100%)`;
    el.style.webkitMaskImage = mask;
    el.style.maskImage = mask;
  }

  refreshAllScrollFades(rootEl = null) {
    const scope = rootEl || this.app.element;
    if (!scope) return;

    const board = scope.querySelector(".fk-kanban-board");
    if (board) this.updateHorizontalScrollFade(board);

    scope.querySelectorAll(".fk-col-cards, .fk-folders-view-scroll").forEach((el) => {
      this.updateVerticalScrollFade(el);
    });
  }

  /* ================= AUTO-SCROLL INTELIGENTE COM ACELERAÇÃO FORA DA JANELA ================= */

  updateDragAutoScroll(ev, onScrollStep = null, allowVerticalColumnScroll = true) {
    this._autoScrollState = {
      clientX: ev.clientX,
      clientY: ev.clientY,
      onScrollStep,
      allowVerticalColumnScroll
    };

    if (!this._autoScrollRaf) {
      const tick = () => {
        if (!this._autoScrollState) {
          this._autoScrollRaf = null;
          return;
        }
        const didScroll = this._performAutoScrollStep(this._autoScrollState);
        if (didScroll && typeof this._autoScrollState.onScrollStep === "function") {
          this._autoScrollState.onScrollStep({
            clientX: this._autoScrollState.clientX,
            clientY: this._autoScrollState.clientY
          });
        }
        this._autoScrollRaf = requestAnimationFrame(tick);
      };
      this._autoScrollRaf = requestAnimationFrame(tick);
    }
  }

  stopDragAutoScroll() {
    if (this._autoScrollRaf) {
      cancelAnimationFrame(this._autoScrollRaf);
      this._autoScrollRaf = null;
    }
    this._autoScrollState = null;
  }

  _calcEdgeScrollDelta(pos, minEdge, maxEdge, winMinEdge, winMaxEdge, edgeZone = 52) {
    let delta = 0;

    if (pos < minEdge + edgeZone) {
      const insideDepth = Math.min(edgeZone, Math.max(0, minEdge + edgeZone - pos));
      const baseSpeed = (insideDepth / edgeZone) * 11;
      const outsideContainer = Math.max(0, minEdge - pos);
      const outsideWindow = Math.max(0, winMinEdge - pos);
      const boost = outsideContainer * 0.16 + outsideWindow * 0.28;
      delta = -Math.min(42, Math.max(1.5, baseSpeed + boost));
    } else if (pos > maxEdge - edgeZone) {
      const insideDepth = Math.min(edgeZone, Math.max(0, pos - (maxEdge - edgeZone)));
      const baseSpeed = (insideDepth / edgeZone) * 11;
      const outsideContainer = Math.max(0, pos - maxEdge);
      const outsideWindow = Math.max(0, pos - winMaxEdge);
      const boost = outsideContainer * 0.16 + outsideWindow * 0.28;
      delta = Math.min(42, Math.max(1.5, baseSpeed + boost));
    }

    return Math.round(delta);
  }

  _performAutoScrollStep({ clientX, clientY, allowVerticalColumnScroll }) {
    const body = this.view.getManagerBody();
    if (!body) return false;

    const winEl = this.app.element;
    const winRect = winEl ? winEl.getBoundingClientRect() : body.getBoundingClientRect();
    let scrolled = false;

    const board = body.querySelector(".fk-kanban-board");
    if (board) {
      const bRect = board.getBoundingClientRect();
      const dx = this._calcEdgeScrollDelta(clientX, bRect.left, bRect.right, winRect.left, winRect.right, 56);
      if (dx !== 0) {
        const prevLeft = board.scrollLeft;
        board.scrollLeft += dx;
        if (board.scrollLeft !== prevLeft) {
          this.updateHorizontalScrollFade(board);
          scrolled = true;
        }
      }

      if (allowVerticalColumnScroll) {
        const clampedX = Math.max(bRect.left + 8, Math.min(bRect.right - 8, clientX));
        const columns = board.querySelectorAll(".fk-column");
        for (const colEl of columns) {
          const cRect = colEl.getBoundingClientRect();
          if (clampedX >= cRect.left && clampedX <= cRect.right) {
            const cardsEl = colEl.querySelector(".fk-col-cards");
            if (cardsEl) {
              const cardsRect = cardsEl.getBoundingClientRect();
              const dy = this._calcEdgeScrollDelta(
                clientY,
                cardsRect.top,
                cardsRect.bottom,
                winRect.top,
                winRect.bottom,
                48
              );
              if (dy !== 0) {
                const prevTop = cardsEl.scrollTop;
                cardsEl.scrollTop += dy;
                if (cardsEl.scrollTop !== prevTop) {
                  this.updateVerticalScrollFade(cardsEl);
                  scrolled = true;
                }
              }
            }
            break;
          }
        }
      }
    }

    const foldersScroll = body.querySelector(".fk-folders-view-scroll");
    if (foldersScroll) {
      const fRect = foldersScroll.getBoundingClientRect();
      const dy = this._calcEdgeScrollDelta(clientY, fRect.top, fRect.bottom, winRect.top, winRect.bottom, 54);
      if (dy !== 0) {
        const prevTop = foldersScroll.scrollTop;
        foldersScroll.scrollTop += dy;
        if (foldersScroll.scrollTop !== prevTop) {
          this.updateVerticalScrollFade(foldersScroll);
          scrolled = true;
        }
      }
    }

    return scrolled;
  }

  getClampedPointInManager(clientX, clientY) {
    const body = this.view.getManagerBody();
    if (!body) return { x: clientX, y: clientY };
    const rect = body.getBoundingClientRect();
    return {
      x: Math.max(rect.left + 6, Math.min(rect.right - 6, clientX)),
      y: Math.max(rect.top + 6, Math.min(rect.bottom - 6, clientY))
    };
  }
}