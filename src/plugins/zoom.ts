import type { ChartPlugin, InternalChart } from "../chart-library.ts";
import { ChartManager } from "../chart-library.ts";

export interface ZoomPluginOptions {
  momentumDecay?: number;
}

export function zoomPlugin(opts: ZoomPluginOptions = {}): ChartPlugin {
  const decay = opts.momentumDecay ?? 0.91;

  interface ZoomState {
    lastX: number;
    lastY: number;
    velX: number;
    velY: number;
    abort: AbortController;
  }

  const state = new WeakMap<InternalChart, ZoomState>();

  return {
    name: "zoom",

    install(chart, el) {
      const mgr = ChartManager.getInstance();
      const ac = new AbortController();
      const s: ZoomState = {
        lastX: 0,
        lastY: 0,
        velX: 0,
        velY: 0,
        abort: ac,
      };
      state.set(chart, s);

      let pointers: PointerEvent[] = [];
      let lastTime = 0;
      let pinchDistance = 0,
        pinchZoomX = 1,
        pinchZoomY = 1,
        pinchX = 0.5,
        pinchY = 0.5;

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

      const cancelDrag = () => {
        if (chart.dragging) {
          chart.dragging = false;
          pointers = [];
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
          } else if (pointers.length === 2) {
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
        { signal: ac.signal },
      );

      el.addEventListener(
        "pointermove",
        (e) => {
          const idx = pointers.findIndex((p) => p.pointerId === e.pointerId);
          if (idx >= 0) pointers[idx] = e;

          if (pointers.length === 1 && chart.dragging) {
            const rect = el.getBoundingClientRect();
            const dx = (e.clientX - s.lastX) / rect.width;
            const dy = (e.clientY - s.lastY) / rect.height;

            const now = performance.now();
            if (now - lastTime < 100) {
              s.velX = s.velX * 0.5 + dx * 0.5;
              s.velY = s.velY * 0.5 + dy * 0.5;
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
            const dx = pointers[1].clientX - pointers[0].clientX;
            const dy = pointers[1].clientY - pointers[0].clientY;
            const d = Math.hypot(dx, dy);
            const scale = d / pinchDistance;

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
        { signal: ac.signal },
      );

      const endPointer = (e: PointerEvent) => {
        pointers = pointers.filter((p) => p.pointerId !== e.pointerId);
        el.releasePointerCapture(e.pointerId);

        if (pointers.length === 0 && chart.dragging) {
          chart.dragging = false;
          if (Math.abs(s.velX) > 0.001 || Math.abs(s.velY) > 0.001) {
            startMomentum();
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

      // Double-tap to reset view
      let lastTap = 0;
      el.addEventListener(
        "pointerup",
        () => {
          const now = Date.now();
          if (now - lastTap < 300) mgr.resetView(chart.id);
          lastTap = now;
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
        s.abort.abort();
        state.delete(chart);
      }
    },
  };
}
