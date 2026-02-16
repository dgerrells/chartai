import type { ChartPlugin, InternalChart } from "../chart-library.ts";
import { ChartManager } from "../chart-library.ts";

export interface ZoomPluginOptions {
  momentumDecay?: number;
}

export function zoomPlugin(opts: ZoomPluginOptions = {}): ChartPlugin {
  const decay = opts.momentumDecay ?? 0.9;

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
      // Configure touch behavior
      // touch-action: none - touch starts inside chart = chart interaction, not page scroll
      // To scroll the page, users touch outside the chart - simple and predictable
      const originalTouchAction = el.style.touchAction;
      const originalUserSelect = el.style.userSelect;
      const originalWebkitUserSelect = (el.style as any).webkitUserSelect;
      el.style.touchAction = "none";
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
      type GestureState = "none" | "detecting" | "pan" | "pinch" | "press";
      let gestureState: GestureState = "none";

      // Gesture start position
      let startX = 0;
      let startY = 0;
      let lastX = 0;
      let lastY = 0;
      let lastTime = 0;

      // Thresholds
      const PAN_THRESHOLD = 10; // px before pan starts
      const TAP_THRESHOLD = 10; // px for tap detection
      const PRESS_TIME = 500; // ms for press gesture

      // Gesture timers
      let pressTimer: number | null = null;

      // Pinch state
      let pinchStartDist = 0;
      let pinchStartZoomX = 1;
      let pinchStartZoomY = 1;
      let pinchCenterX = 0.5;
      let pinchCenterY = 0.5;

      // Pan velocity
      let velX = 0;
      let velY = 0;

      // Tap detection
      let lastTapTime = 0;

      // Mouse edge scaling
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
          velX *= decay;
          velY *= decay;

          if (Math.abs(velX) > 5e-5 || Math.abs(velY) > 5e-5) {
            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "x-only")
            ) {
              chart.view.panX -= velX / chart.view.zoomX;
            }
            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "y-only")
            ) {
              chart.view.panY += velY / chart.view.zoomY;
            }
            sendView();
            chart.momentum = requestAnimationFrame(tick);
          } else {
            chart.momentum = null;
          }
        };

        chart.momentum = requestAnimationFrame(tick);
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
            // Single pointer - start detecting
            gestureState = "detecting";
            startX = e.clientX;
            startY = e.clientY;
            lastX = e.clientX;
            lastY = e.clientY;
            velX = velY = 0;
            lastTime = performance.now();
            edgeScaleMode = null;

            if (e.pointerType === "touch") {
              // Start press detection
              pressTimer = window.setTimeout(() => {
                if (gestureState === "detecting") {
                  gestureState = "press";
                  chart.dragging = false;
                }
              }, PRESS_TIME);
            } else {
              // Mouse: check for edge scaling
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
                chart.dragging = true;
              } else if (overXAxis && !overYAxis) {
                edgeScaleMode = "x";
                edgeScaleStart = e.clientX;
                edgeScaleInitialZoom = chart.view.zoomX;
                chart.dragging = true;
              } else {
                chart.dragging = true;
              }
            }
          } else if (pointers.length === 2) {
            // Two pointers - pinch gesture
            if (pressTimer) {
              clearTimeout(pressTimer);
              pressTimer = null;
            }

            gestureState = "pinch";
            chart.dragging = false;

            // Prevent browser pinch-zoom
            if (e.pointerType === "touch") {
              e.preventDefault();
            }

            const rect = el.getBoundingClientRect();
            const dx = pointers[1].clientX - pointers[0].clientX;
            const dy = pointers[1].clientY - pointers[0].clientY;
            pinchStartDist = Math.hypot(dx, dy);
            pinchStartZoomX = chart.view.zoomX;
            pinchStartZoomY = chart.view.zoomY;
            pinchCenterX =
              ((pointers[0].clientX + pointers[1].clientX) / 2 - rect.left) /
              rect.width;
            pinchCenterY =
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

          if (pointers.length === 1) {
            const totalDist = Math.hypot(
              e.clientX - startX,
              e.clientY - startY,
            );

            // Gesture recognition: detecting -> pan
            if (gestureState === "detecting" && totalDist > PAN_THRESHOLD) {
              gestureState = "pan";
              chart.dragging = true;
              if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
              }
            }

            // Handle press gesture (no movement)
            if (gestureState === "press") {
              return; // Don't pan in press mode
            }

            // Handle edge scaling (mouse only)
            if (edgeScaleMode && e.pointerType !== "touch") {
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
                const pixelDelta = edgeScaleStart - e.clientY;
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
            }

            // Handle pan gesture
            if (gestureState === "pan" || (chart.dragging && !edgeScaleMode)) {
              const rect = el.getBoundingClientRect();
              const dx = (e.clientX - lastX) / rect.width;
              const dy = (e.clientY - lastY) / rect.height;

              // Update velocity for momentum
              const now = performance.now();
              if (now - lastTime < 100) {
                velX = velX * 0.3 + dx * 0.7;
                velY = velY * 0.3 + dy * 0.7;
              }
              lastTime = now;

              // Apply pan
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

              lastX = e.clientX;
              lastY = e.clientY;
              sendView();
            }
          } else if (pointers.length === 2 && gestureState === "pinch") {
            // Handle pinch gesture - prevent browser zoom
            if (e.pointerType === "touch") {
              e.preventDefault();
            }

            const rect = el.getBoundingClientRect();
            const dx = pointers[1].clientX - pointers[0].clientX;
            const dy = pointers[1].clientY - pointers[0].clientY;
            const dist = Math.hypot(dx, dy);

            // Recalculate pinch center on every move - zoom towards current finger position
            const currentPinchCenterX =
              ((pointers[0].clientX + pointers[1].clientX) / 2 - rect.left) /
              rect.width;
            const currentPinchCenterY =
              1 -
              ((pointers[0].clientY + pointers[1].clientY) / 2 - rect.top) /
                rect.height;

            // Natural pinch: logarithmic scaling
            const pixelChange = dist - pinchStartDist;
            const scale = Math.exp(pixelChange / 300);

            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "x-only")
            ) {
              const newZoomX = Math.max(
                ChartManager.MIN_ZOOM,
                Math.min(ChartManager.MAX_ZOOM, pinchStartZoomX * scale),
              );
              // Zoom towards current pinch center, not initial
              const fx = chart.view.panX + currentPinchCenterX / chart.view.zoomX;
              chart.view.zoomX = newZoomX;
              chart.view.panX = fx - currentPinchCenterX / newZoomX;
            }

            if (
              chart.zoomMode !== "none" &&
              (chart.zoomMode === "both" || chart.zoomMode === "y-only")
            ) {
              const newZoomY = Math.max(
                ChartManager.MIN_ZOOM,
                Math.min(ChartManager.MAX_ZOOM, pinchStartZoomY * scale),
              );
              // Zoom towards current pinch center, not initial
              const fy = chart.view.panY + currentPinchCenterY / chart.view.zoomY;
              chart.view.zoomY = newZoomY;
              chart.view.panY = fy - currentPinchCenterY / newZoomY;
            }

            sendView();
          }
        },
        { passive: false, signal: ac.signal },
      );

      const endPointer = (e: PointerEvent) => {
        pointers = pointers.filter((p) => p.pointerId !== e.pointerId);
        el.releasePointerCapture(e.pointerId);

        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }

        if (pointers.length === 0) {
          const totalDist = Math.hypot(e.clientX - startX, e.clientY - startY);
          const isTap = totalDist < TAP_THRESHOLD && gestureState !== "pan";

          // Handle tap gesture (single or double)
          if (isTap && e.pointerType === "touch") {
            const now = Date.now();
            if (now - lastTapTime < 300) {
              // Double tap - reset view
              mgr.resetView(chart.id);
              lastTapTime = 0;
            } else {
              lastTapTime = now;
            }
          }

          // Handle mouse double-click
          if (isTap && e.pointerType !== "touch") {
            const now = Date.now();
            if (now - lastTapTime < 300) {
              mgr.resetView(chart.id);
              lastTapTime = 0;
            } else {
              lastTapTime = now;
            }
          }

          // Start momentum if was panning
          if (
            gestureState === "pan" &&
            (Math.abs(velX) > 0.001 || Math.abs(velY) > 0.001)
          ) {
            startMomentum();
          }

          // Reset gesture state
          gestureState = "none";
          chart.dragging = false;
          edgeScaleMode = null;
        } else if (pointers.length === 1) {
          // Went from 2 pointers back to 1
          gestureState = "detecting";
          startX = pointers[0].clientX;
          startY = pointers[0].clientY;
          lastX = pointers[0].clientX;
          lastY = pointers[0].clientY;
        }
      };

      el.addEventListener("pointerup", endPointer, { signal: ac.signal });
      el.addEventListener("pointercancel", endPointer, { signal: ac.signal });

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
