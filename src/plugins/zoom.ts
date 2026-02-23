import type { ChartPlugin, InternalChart, ZoomMode } from "../types.ts";
import { ChartManager } from "../chart-library.ts";
import { MARGIN } from "./shared.ts";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10_000_000;

export interface ZoomConfig {
  zoomMode?: ZoomMode;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    zoom: ZoomConfig;
  }
}

export interface ZoomPluginOptions {
  momentumDecay?: number;
}

export function zoomPlugin(
  opts: ZoomPluginOptions = {},
): ChartPlugin<ZoomConfig> {
  const decay = opts.momentumDecay ?? 0.9;

  interface ZoomState {
    lastX: number;
    lastY: number;
    velX: number;
    velY: number;
    momentum: number | null;
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
      el.style.touchAction = "none";
      el.style.userSelect = "none";
      (el.style as any).webkitUserSelect = "none";

      const mgr = ChartManager;
      const ac = new AbortController();
      const s: ZoomState = {
        lastX: 0,
        lastY: 0,
        velX: 0,
        velY: 0,
        momentum: null,
        abort: ac,
        originalTouchAction,
        originalUserSelect,
        originalWebkitUserSelect,
        el,
      };

      const mode = () => chart.config.zoomMode ?? "both";
      state.set(chart, s);

      let pointers: PointerEvent[] = [];
      type GestureState = "none" | "detecting" | "pan" | "pinch" | "press";
      let gestureState: GestureState = "none";
      let startX = 0,
        startY = 0,
        lastX = 0,
        lastY = 0,
        lastTime = 0;
      const PAN_THRESHOLD = 10; // px
      const TAP_THRESHOLD = 10; // px
      const PRESS_TIME = 500; // ms
      let pressTimer: number | null = null;
      let pinchStartDist = 0,
        pinchStartZoomX = 1,
        pinchStartZoomY = 1;
      let pinchCenterX = 0.5,
        pinchCenterY = 0.5;
      let velX = 0,
        velY = 0;
      let lastTapTime = 0;
      let edgeScaleMode: "x" | "y" | null = null;
      let edgeScaleStart = 0,
        edgeScaleInitialZoom = 1;

      const sendView = () => {
        mgr.sendViewTransform(chart);
        mgr.drawChart(chart);
        if (mgr.syncViews) mgr.syncAllViews(chart);
      };

      const startMomentum = () => {
        if (s.momentum) cancelAnimationFrame(s.momentum);

        const tick = () => {
          velX *= decay;
          velY *= decay;

          if (Math.abs(velX) > 5e-5 || Math.abs(velY) > 5e-5) {
            const m = mode();
            if (m !== "none" && (m === "both" || m === "x-only"))
              chart.view.panX -= velX / chart.view.zoomX;
            if (m !== "none" && (m === "both" || m === "y-only"))
              chart.view.panY += velY / chart.view.zoomY;
            sendView();
            s.momentum = requestAnimationFrame(tick);
          } else {
            s.momentum = null;
          }
        };

        s.momentum = requestAnimationFrame(tick);
      };

      el.addEventListener(
        "pointerdown",
        (e) => {
          if (s.momentum) {
            cancelAnimationFrame(s.momentum);
            s.momentum = null;
          }

          pointers.push(e);
          el.setPointerCapture(e.pointerId);

          if (pointers.length === 1) {
            gestureState = "detecting";
            startX = e.clientX;
            startY = e.clientY;
            lastX = e.clientX;
            lastY = e.clientY;
            velX = velY = 0;
            lastTime = performance.now();
            edgeScaleMode = null;

            if (e.pointerType === "touch") {
              pressTimer = window.setTimeout(() => {
                if (gestureState === "detecting") {
                  gestureState = "press";
                  chart.dragging = false;
                }
              }, PRESS_TIME);
            } else {
              const rect = el.getBoundingClientRect();
              const localX = e.clientX - rect.left;
              const localY = e.clientY - rect.top;
              const margin = MARGIN;
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
            if (pressTimer) {
              clearTimeout(pressTimer);
              pressTimer = null;
            }

            gestureState = "pinch";
            chart.dragging = false;

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

          if (
            pointers.length >= 1 &&
            e.buttons === 0 &&
            (gestureState === "pan" ||
              gestureState === "detecting" ||
              gestureState === "press" ||
              edgeScaleMode !== null)
          ) {
            endPointer(e);
            return;
          }

          if (pointers.length === 1) {
            const totalDist = Math.hypot(
              e.clientX - startX,
              e.clientY - startY,
            );

            if (gestureState === "detecting" && totalDist > PAN_THRESHOLD) {
              gestureState = "pan";
              chart.dragging = true;
              if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
              }
            }

            if (gestureState === "press") {
              return;
            }

            if (edgeScaleMode && e.pointerType !== "touch") {
              if (edgeScaleMode === "x") {
                const pixelDelta = e.clientX - edgeScaleStart;
                const scale = Math.exp(pixelDelta / 200);
                const newZoom = Math.max(
                  MIN_ZOOM,
                  Math.min(MAX_ZOOM, edgeScaleInitialZoom * scale),
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
                  MIN_ZOOM,
                  Math.min(MAX_ZOOM, edgeScaleInitialZoom * scale),
                );
                const fy = chart.view.panY + 0.5 / edgeScaleInitialZoom;
                chart.view.zoomY = newZoom;
                chart.view.panY = fy - 0.5 / newZoom;
                sendView();
                return;
              }
            }

            if (gestureState === "pan" || (chart.dragging && !edgeScaleMode)) {
              const rect = el.getBoundingClientRect();
              const dx = (e.clientX - lastX) / rect.width;
              const dy = (e.clientY - lastY) / rect.height;

              const now = performance.now();
              if (now - lastTime < 100) {
                velX = velX * 0.3 + dx * 0.7;
                velY = velY * 0.3 + dy * 0.7;
              }
              lastTime = now;

              const m = mode();
              if (m !== "none" && (m === "both" || m === "x-only"))
                chart.view.panX -= dx / chart.view.zoomX;
              if (m !== "none" && (m === "both" || m === "y-only"))
                chart.view.panY += dy / chart.view.zoomY;

              lastX = e.clientX;
              lastY = e.clientY;
              sendView();
            }
          } else if (pointers.length === 2 && gestureState === "pinch") {
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

            const pixelChange = dist - pinchStartDist;
            const scale = Math.exp(pixelChange / 280);

            const pm = mode();
            if (pm !== "none" && (pm === "both" || pm === "x-only")) {
              const newZoomX = Math.max(
                MIN_ZOOM,
                Math.min(MAX_ZOOM, pinchStartZoomX * scale),
              );
              const fx =
                chart.view.panX + currentPinchCenterX / chart.view.zoomX;
              chart.view.zoomX = newZoomX;
              chart.view.panX = fx - currentPinchCenterX / newZoomX;
            }
            if (pm !== "none" && (pm === "both" || pm === "y-only")) {
              const newZoomY = Math.max(
                MIN_ZOOM,
                Math.min(MAX_ZOOM, pinchStartZoomY * scale),
              );
              const fy =
                chart.view.panY + currentPinchCenterY / chart.view.zoomY;
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

          if (isTap) {
            const now = Date.now();
            if (now - lastTapTime < 300) {
              mgr.resetView(chart.id);
              lastTapTime = 0;
            } else {
              lastTapTime = now;
            }
          }

          if (
            gestureState === "pan" &&
            (Math.abs(velX) > 0.001 || Math.abs(velY) > 0.001)
          ) {
            startMomentum();
          }

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

      el.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();

          if (s.momentum) {
            cancelAnimationFrame(s.momentum);
            s.momentum = null;
          }

          const rect = el.getBoundingClientRect();
          const localX = e.clientX - rect.left;
          const localY = e.clientY - rect.top;
          const mx = localX / rect.width;
          const my = 1 - localY / rect.height;
          const scale = 1 - e.deltaY * 0.002;

          const margin = MARGIN;
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
            const wm = mode();
            zoomX = wm === "both" || wm === "x-only";
            zoomY = wm === "both" || wm === "y-only";
          }

          if (zoomX) {
            const fx = chart.view.panX + mx / chart.view.zoomX;
            chart.view.zoomX = Math.max(
              MIN_ZOOM,
              Math.min(MAX_ZOOM, chart.view.zoomX * scale),
            );
            chart.view.panX = fx - mx / chart.view.zoomX;
          }

          if (zoomY) {
            const fy = chart.view.panY + my / chart.view.zoomY;
            chart.view.zoomY = Math.max(
              MIN_ZOOM,
              Math.min(MAX_ZOOM, chart.view.zoomY * scale),
            );
            chart.view.panY = fy - my / chart.view.zoomY;
          }

          if (zoomX || zoomY) sendView();
        },
        { passive: false, signal: ac.signal },
      );
    },

    resetView(chart) {
      const s = state.get(chart);
      if (s?.momentum) {
        cancelAnimationFrame(s.momentum);
        s.momentum = null;
      }
    },

    uninstall(chart) {
      const s = state.get(chart);
      if (s) {
        if (s.momentum) {
          cancelAnimationFrame(s.momentum);
          s.momentum = null;
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
