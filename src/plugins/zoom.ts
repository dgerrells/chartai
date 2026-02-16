import type { ChartPlugin, InternalChart } from "../chart-library.ts";
import { ChartManager } from "../chart-library.ts";

export interface ZoomPluginOptions {
  momentumDecay?: number;
}

export function zoomPlugin(opts: ZoomPluginOptions = {}): ChartPlugin {
  const decay = opts.momentumDecay ?? 0.9; // Reduced decay for tighter control

  interface ZoomState {
    lastX: number;
    lastY: number;
    velX: number;
    velY: number;
    abort: AbortController;
    originalTouchAction: string;
    originalUserSelect: string;
    originalWebkitUserSelect: string;
    el: HTMLElement;
  }

  const state = new WeakMap<InternalChart, ZoomState>();

  return {
    name: "zoom",

    install(chart, el) {
      const originalTouchAction = el.style.touchAction;
      const originalUserSelect = el.style.userSelect;
      const originalWebkitUserSelect = (el.style as any).webkitUserSelect;
      el.style.touchAction = "pan-x pan-y";
      el.style.userSelect = "none";
      (el.style as any).webkitUserSelect = "none";

      const mgr = ChartManager.getInstance();
      const ac = new AbortController();
      const s: ZoomState = {
        lastX: 0,
        lastY: 0,
        velX: 0,
        velY: 0,
        abort: ac,
        originalTouchAction,
        originalUserSelect,
        originalWebkitUserSelect,
        el,
      };
      state.set(chart, s);

      let pointers: PointerEvent[] = [];
      let lastTime = 0;
      let pinchDistance = 0,
        pinchZoomX = 1,
        pinchZoomY = 1,
        pinchX = 0.5,
        pinchY = 0.5;
      let longPressTimer: number | null = null;
      let isInspectMode = false;
      let longPressCancelled = false;
      const LONG_PRESS_DURATION = 3000; // 3s for inspect mode

      // Edge scaling state
      let edgeScaleMode: "x" | "y" | null = null;
      let edgeScaleStart = 0;
      let edgeScaleInitialZoom = 1;

      const sendView = () => {
        mgr.sendViewTransform(chart);
        mgr.drawChart(chart);
        if (mgr.syncViews) mgr.syncAllViews(chart);
      };

      const startMomentum = () => {
        if (chart.momentum) cancelAnimationFrame(chart.momentum);

        const tick = () => {
          s.velX *= decay;
          s.velY *= decay;

          if (Math.abs(s.velX) > 5e-5 || Math.abs(s.velY) > 5e-5) {
            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "x-only")
            ) {
              chart.view.panX -= s.velX / chart.view.zoomX;
            }
            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "y-only")
            ) {
              chart.view.panY += s.velY / chart.view.zoomY;
            }
            sendView();
            chart.momentum = requestAnimationFrame(tick);
          } else {
            chart.momentum = null;
          }
        };

        chart.momentum = requestAnimationFrame(tick);
      };

      const cancelDrag = (e: PointerEvent) => {
        if (chart.dragging && pointers.length === 0) {
          chart.dragging = false;
        }
      };

      el.addEventListener(
        "pointerdown",
        (e) => {
          if (chart.momentum) {
            cancelAnimationFrame(chart.momentum);
            chart.momentum = null;
          }

          pointers.push(e);
          el.setPointerCapture(e.pointerId);

          if (pointers.length === 1) {
            chart.dragging = true;
            s.lastX = e.clientX;
            s.lastY = e.clientY;
            s.velX = s.velY = 0;
            lastTime = performance.now();
            isInspectMode = false;
            longPressCancelled = false;
            edgeScaleMode = null;

            // Detect edge interaction for mobile
            if (e.pointerType === "touch") {
              const rect = el.getBoundingClientRect();
              const localX = e.clientX - rect.left;
              const localY = e.clientY - rect.top;
              const margin = ChartManager.MARGIN;
              const overYAxis = localX < margin.left;
              const overXAxis = localY > rect.height - margin.bottom;

              if (overYAxis && !overXAxis) {
                edgeScaleMode = "y";
                edgeScaleStart = e.clientY;
                edgeScaleInitialZoom = chart.view.zoomY;
              } else if (overXAxis && !overYAxis) {
                edgeScaleMode = "x";
                edgeScaleStart = e.clientX;
                edgeScaleInitialZoom = chart.view.zoomX;
              } else {
                // Start long-press timer for inspect mode (only if not on edge)
                longPressTimer = window.setTimeout(() => {
                  if (!longPressCancelled) {
                    isInspectMode = true;
                    chart.dragging = false;
                  }
                }, LONG_PRESS_DURATION);
              }
            }
          } else if (pointers.length === 2) {
            // Cancel long-press and inspect mode when second finger touches
            if (longPressTimer) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
            }
            isInspectMode = false;

            // Prevent page zoom when pinching
            if (e.pointerType === "touch") {
              e.preventDefault();
            }
            const rect = el.getBoundingClientRect();
            const dx = pointers[1].clientX - pointers[0].clientX;
            const dy = pointers[1].clientY - pointers[0].clientY;
            pinchDistance = Math.hypot(dx, dy);
            pinchZoomX = chart.view.zoomX;
            pinchZoomY = chart.view.zoomY;
            pinchX =
              ((pointers[0].clientX + pointers[1].clientX) / 2 - rect.left) /
              rect.width;
            pinchY =
              1 -
              ((pointers[0].clientY + pointers[1].clientY) / 2 - rect.top) /
                rect.height;
          }
        },
        { passive: false, signal: ac.signal },
      );

      el.addEventListener(
        "pointermove",
        (e) => {
          const idx = pointers.findIndex((p) => p.pointerId === e.pointerId);
          if (idx >= 0) {
            pointers[idx] = e;
          }

          if (pointers.length === 1 && chart.dragging) {
            const rect = el.getBoundingClientRect();
            const dx = (e.clientX - s.lastX) / rect.width;
            const dy = (e.clientY - s.lastY) / rect.height;
            // Cancel long-press timer permanently if user moves
            if (longPressTimer && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
              longPressCancelled = true; // Don't restart until touch up
            }

            // Skip panning if in inspect mode
            if (isInspectMode) {
              s.lastX = e.clientX;
              s.lastY = e.clientY;
              return;
            }

            if (e.pointerType === "touch") {
              e.preventDefault();
            }

            if (edgeScaleMode === "x") {
              const pixelDelta = e.clientX - edgeScaleStart;
              const scale = Math.exp(pixelDelta / 200);
              const newZoom = Math.max(
                ChartManager.MIN_ZOOM,
                Math.min(ChartManager.MAX_ZOOM, edgeScaleInitialZoom * scale),
              );
              const fx = chart.view.panX + 0.5 / edgeScaleInitialZoom;
              chart.view.zoomX = newZoom;
              chart.view.panX = fx - 0.5 / newZoom;
              sendView();
              return;
            } else if (edgeScaleMode === "y") {
              const pixelDelta = edgeScaleStart - e.clientY; // Inverted for Y
              const scale = Math.exp(pixelDelta / 200);
              const newZoom = Math.max(
                ChartManager.MIN_ZOOM,
                Math.min(ChartManager.MAX_ZOOM, edgeScaleInitialZoom * scale),
              );
              const fy = chart.view.panY + 0.5 / edgeScaleInitialZoom;
              chart.view.zoomY = newZoom;
              chart.view.panY = fy - 0.5 / newZoom;
              sendView();
              return;
            }

            const now = performance.now();
            if (now - lastTime < 100) {
              s.velX = s.velX * 0.3 + dx * 0.7;
              s.velY = s.velY * 0.3 + dy * 0.7;
            }
            lastTime = now;

            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "x-only")
            ) {
              chart.view.panX -= dx / chart.view.zoomX;
            }
            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "y-only")
            ) {
              chart.view.panY += dy / chart.view.zoomY;
            }
            s.lastX = e.clientX;
            s.lastY = e.clientY;
            sendView();
          } else if (pointers.length === 2) {
            if (e.pointerType === "touch") {
              e.preventDefault();
            }
            const dx = pointers[1].clientX - pointers[0].clientX;
            const dy = pointers[1].clientY - pointers[0].clientY;
            const d = Math.hypot(dx, dy);

            const pixelChange = d - pinchDistance;
            const scale = Math.exp(pixelChange / 300);

            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "x-only")
            ) {
              const newZoomX = Math.max(
                ChartManager.MIN_ZOOM,
                Math.min(ChartManager.MAX_ZOOM, pinchZoomX * scale),
              );
              const fx = chart.view.panX + pinchX / pinchZoomX;
              chart.view.zoomX = newZoomX;
              chart.view.panX = fx - pinchX / newZoomX;
            }

            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "y-only")
            ) {
              const newZoomY = Math.max(
                ChartManager.MIN_ZOOM,
                Math.min(ChartManager.MAX_ZOOM, pinchZoomY * scale),
              );
              const fy = chart.view.panY + pinchY / pinchZoomY;
              chart.view.zoomY = newZoomY;
              chart.view.panY = fy - pinchY / newZoomY;
            }

            sendView();
          }
        },
        { passive: false, signal: ac.signal },
      );

      const endPointer = (e: PointerEvent) => {
        pointers = pointers.filter((p) => p.pointerId !== e.pointerId);
        el.releasePointerCapture(e.pointerId);

        // Clean up all touch state
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }

        if (pointers.length === 0) {
          isInspectMode = false;
          longPressCancelled = false;
          edgeScaleMode = null;

          if (chart.dragging) {
            chart.dragging = false;
            if (
              !edgeScaleMode &&
              (Math.abs(s.velX) > 0.001 || Math.abs(s.velY) > 0.001)
            ) {
              startMomentum();
            }
          }
        }
      };

      el.addEventListener("pointerup", endPointer, { signal: ac.signal });
      el.addEventListener("pointercancel", endPointer, {
        signal: ac.signal,
      });
      el.addEventListener("pointerleave", cancelDrag, {
        signal: ac.signal,
      });

      // Double-tap to reset view (check before pointer removal)
      let lastTap = 0;
      let lastTapWasSinglePointer = false;
      el.addEventListener(
        "pointerup",
        (e) => {
          // Check if this is a single-pointer release (before endPointer removes it)
          const isSinglePointerRelease = pointers.length === 1;
          
          if (isSinglePointerRelease && e.pointerType === "touch") {
            // Only count as tap if not in edge scale mode and didn't move (cancel long press)
            const isQuickTap = !edgeScaleMode && !longPressCancelled;
            
            if (isQuickTap) {
              const now = Date.now();
              if (now - lastTap < 300 && lastTapWasSinglePointer) {
                mgr.resetView(chart.id);
                lastTap = 0; // Reset to prevent triple-tap
                lastTapWasSinglePointer = false;
              } else {
                lastTap = now;
                lastTapWasSinglePointer = true;
              }
            } else {
              // Was a pan/scale, reset tap timing
              lastTapWasSinglePointer = false;
            }
          } else if (e.pointerType !== "touch") {
            // Mouse double-click
            const now = Date.now();
            if (now - lastTap < 300) {
              mgr.resetView(chart.id);
              lastTap = 0;
            } else {
              lastTap = now;
            }
          } else {
            // Multi-touch release, reset single pointer flag
            lastTapWasSinglePointer = false;
          }
        },
        { signal: ac.signal },
      );

      // Wheel zoom
      el.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();

          if (chart.momentum) {
            cancelAnimationFrame(chart.momentum);
            chart.momentum = null;
          }

          const rect = el.getBoundingClientRect();
          const localX = e.clientX - rect.left;
          const localY = e.clientY - rect.top;
          const mx = localX / rect.width;
          const my = 1 - localY / rect.height;
          const scale = 1 - e.deltaY * 0.002;

          const margin = ChartManager.MARGIN;
          const overYAxis = localX < margin.left;
          const overXAxis = localY > rect.height - margin.bottom;

          let zoomX: boolean;
          let zoomY: boolean;

          if (overYAxis) {
            zoomX = false;
            zoomY = true;
          } else if (overXAxis) {
            zoomX = true;
            zoomY = false;
          } else {
            zoomX = chart.zoomMode === "both" || chart.zoomMode === "x-only";
            zoomY = chart.zoomMode === "both" || chart.zoomMode === "y-only";
          }

          if (zoomX) {
            const fx = chart.view.panX + mx / chart.view.zoomX;
            chart.view.zoomX = Math.max(
              ChartManager.MIN_ZOOM,
              Math.min(ChartManager.MAX_ZOOM, chart.view.zoomX * scale),
            );
            chart.view.panX = fx - mx / chart.view.zoomX;
          }

          if (zoomY) {
            const fy = chart.view.panY + my / chart.view.zoomY;
            chart.view.zoomY = Math.max(
              ChartManager.MIN_ZOOM,
              Math.min(ChartManager.MAX_ZOOM, chart.view.zoomY * scale),
            );
            chart.view.panY = fy - my / chart.view.zoomY;
          }

          if (zoomX || zoomY) sendView();
        },
        { passive: false, signal: ac.signal },
      );
    },

    uninstall(chart) {
      const s = state.get(chart);
      if (s) {
        if (chart.momentum) {
          cancelAnimationFrame(chart.momentum);
          chart.momentum = null;
        }
        s.el.style.touchAction = s.originalTouchAction;
        s.el.style.userSelect = s.originalUserSelect;
        (s.el.style as any).webkitUserSelect = s.originalWebkitUserSelect;
        s.abort.abort();
        state.delete(chart);
      }
    },
  };
}
