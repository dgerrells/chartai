import type { ChartPlugin, InternalChart, ChartConfig } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";

export interface RangeSelectorConfig {
  rangeSelectorHeight?: number;
  rangeSelectorMargin?: number;
  brushColor?: string;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    "range-selector": RangeSelectorConfig;
  }
}

interface BrushDrag {
  type: "move" | "left" | "right";
  startX: number;
  startPanX: number;
  startZoomX: number;
}

interface RangeSelectorState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  abort: AbortController;
  resizeObserver: ResizeObserver;
  brushDrag: BrushDrag | null;
}

const states = new WeakMap<InternalChart, RangeSelectorState>();

function drawMiniCanvas(chart: InternalChart, state: RangeSelectorState): void {
  const { canvas, ctx } = state;
  const w = canvas.width;
  const h = canvas.height;
  const dark = ChartManager.isDark;
  const cfg = chart.config as ChartConfig & RangeSelectorConfig;

  const bgColor = cfg.bgColor ?? (dark ? [0.11, 0.11, 0.12] : [0.98, 0.98, 0.98]);
  ctx.fillStyle = `rgb(${bgColor.map((c: number) => Math.round(c * 255)).join(",")})`;
  ctx.fillRect(0, 0, w, h);

  const { bounds: b } = chart;
  const rangeX = b.maxX - b.minX || 1;
  const rangeY = b.maxY - b.minY || 1;

  for (const series of chart.series) {
    if (series.rawX.length === 0) continue;
    const { r, g, b: bv } = series.color;
    ctx.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(bv * 255)},0.7)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(series.rawX.length / w));
    for (let i = 0; i < series.rawX.length; i += step) {
      const sx = ((series.rawX[i] - b.minX) / rangeX) * w;
      const sy = h - ((series.rawY[i] - b.minY) / rangeY) * h;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  const { view: v } = chart;
  const hv = chart.homeView;
  const homeRange = 1 / hv.zoomX;
  const brushL = (v.panX - hv.panX) / homeRange * w;
  const brushR = (v.panX - hv.panX + 1.0 / v.zoomX) / homeRange * w;
  const brushColor =
    cfg.brushColor ?? (dark ? "rgba(255,255,255,0.12)" : "rgba(0,100,255,0.1)");
  const brushBorder = dark ? "rgba(255,255,255,0.35)" : "rgba(0,100,255,0.5)";

  ctx.fillStyle = dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.5)";
  ctx.fillRect(0, 0, brushL, h);
  ctx.fillRect(brushR, 0, w - brushR, h);

  ctx.fillStyle = brushColor;
  ctx.fillRect(brushL, 0, brushR - brushL, h);
  ctx.strokeStyle = brushBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(brushL, 0.75, brushR - brushL, h - 1.5);
}

export const rangeSelectorPlugin: ChartPlugin<RangeSelectorConfig> = {
  name: "range-selector",

  install(chart, el) {
    const cfg = chart.config as ChartConfig & RangeSelectorConfig;
    const height = cfg.rangeSelectorHeight ?? 60;
    const margin = cfg.rangeSelectorMargin ?? 4;
    const ac = new AbortController();

    const canvas = document.createElement("canvas");
    canvas.style.cssText = `display:block;margin-top:${margin}px;`;
    canvas.height = height;
    canvas.width = el.offsetWidth || 400;

    if (el.parentElement) {
      el.parentElement.insertBefore(canvas, el.nextSibling);
    }

    const ctx2d = canvas.getContext("2d")!;
    const state: RangeSelectorState = {
      canvas,
      ctx: ctx2d,
      abort: ac,
      resizeObserver: null!,
      brushDrag: null,
    };
    states.set(chart, state);

    const getRelX = (e: MouseEvent): number => {
      const rect = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    };

    canvas.addEventListener(
      "mousemove",
      (e) => {
        if (state.brushDrag) return;
        const rx = getRelX(e);
        const { view: v } = chart;
        const hv = chart.homeView;
        const homeRange = 1 / hv.zoomX;
        const brushL = (v.panX - hv.panX) / homeRange;
        const brushR = brushL + hv.zoomX / v.zoomX;
        const edgeTol = 5 / canvas.getBoundingClientRect().width;
        if (Math.abs(rx - brushL) < edgeTol || Math.abs(rx - brushR) < edgeTol) {
          canvas.style.cursor = "ew-resize";
        } else if (rx > brushL && rx < brushR) {
          canvas.style.cursor = "grab";
        } else {
          canvas.style.cursor = "default";
        }
      },
      { signal: ac.signal },
    );

    canvas.addEventListener(
      "mousedown",
      (e) => {
        const rx = getRelX(e);
        const { view: v } = chart;
        const hv = chart.homeView;
        const homeRange = 1 / hv.zoomX;
        const brushL = (v.panX - hv.panX) / homeRange;
        const brushR = brushL + hv.zoomX / v.zoomX;
        const edgeTol = 5 / canvas.getBoundingClientRect().width;

        if (Math.abs(rx - brushL) < edgeTol) {
          state.brushDrag = {
            type: "left",
            startX: rx,
            startPanX: v.panX,
            startZoomX: v.zoomX,
          };
        } else if (Math.abs(rx - brushR) < edgeTol) {
          state.brushDrag = {
            type: "right",
            startX: rx,
            startPanX: v.panX,
            startZoomX: v.zoomX,
          };
        } else if (rx > brushL && rx < brushR) {
          state.brushDrag = {
            type: "move",
            startX: rx,
            startPanX: v.panX,
            startZoomX: v.zoomX,
          };
          canvas.style.cursor = "grabbing";
        } else {
          const hv = chart.homeView;
          const homeRange = 1 / hv.zoomX;
          const brushWidth = 1.0 / v.zoomX;
          const newPanX = Math.max(hv.panX, Math.min(hv.panX + homeRange - brushWidth, hv.panX + rx * homeRange - brushWidth / 2));
          chart.view.panX = newPanX;
          ChartManager.requestRender(chart.id);
          ChartManager.drawChart(chart);
          drawMiniCanvas(chart, state);
        }
        e.preventDefault();
      },
      { signal: ac.signal },
    );

    window.addEventListener(
      "mousemove",
      (e) => {
        if (!state.brushDrag) return;
        const rect = canvas.getBoundingClientRect();
        const rx = (e.clientX - rect.left) / rect.width;
        const dx = rx - state.brushDrag.startX;
        const { startPanX, startZoomX } = state.brushDrag;

        const hv = chart.homeView;
        const homeRange = 1 / hv.zoomX;
        if (state.brushDrag.type === "move") {
          chart.view.panX = Math.max(hv.panX, Math.min(hv.panX + homeRange - 1 / startZoomX, startPanX + dx * homeRange));
        } else if (state.brushDrag.type === "left") {
          const newLeft = Math.max(hv.panX, startPanX + dx * homeRange);
          const newRight = startPanX + 1.0 / startZoomX;
          if (newLeft < newRight - 0.01) {
            chart.view.panX = newLeft;
            chart.view.zoomX = Math.max(hv.zoomX, 1.0 / (newRight - newLeft));
          }
        } else if (state.brushDrag.type === "right") {
          const newRight = Math.min(hv.panX + homeRange, startPanX + 1.0 / startZoomX + dx * homeRange);
          if (newRight > startPanX + 0.01) {
            chart.view.zoomX = Math.max(hv.zoomX, 1.0 / (newRight - startPanX));
          }
        }

        ChartManager.requestRender(chart.id);
        ChartManager.drawChart(chart);
        drawMiniCanvas(chart, state);
      },
      { signal: ac.signal },
    );

    window.addEventListener(
      "mouseup",
      (e) => {
        state.brushDrag = null;
        const rect = canvas.getBoundingClientRect();
        const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const { view: v } = chart;
        const hv = chart.homeView;
        const homeRange = 1 / hv.zoomX;
        const brushL = (v.panX - hv.panX) / homeRange;
        const brushR = brushL + hv.zoomX / v.zoomX;
        const edgeTol = 5 / canvas.getBoundingClientRect().width;
        if (Math.abs(rx - brushL) < edgeTol || Math.abs(rx - brushR) < edgeTol) {
          canvas.style.cursor = "ew-resize";
        } else if (rx > brushL && rx < brushR) {
          canvas.style.cursor = "grab";
        } else {
          canvas.style.cursor = "default";
        }
      },
      { signal: ac.signal },
    );

    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      if (w > 0) canvas.width = w;
      drawMiniCanvas(chart, state);
    });
    ro.observe(el);
    state.resizeObserver = ro;

    drawMiniCanvas(chart, state);
  },

  afterDraw(_, chart) {
    const state = states.get(chart);
    if (!state) return;
    const elW = chart.el.offsetWidth;
    if (elW > 0 && state.canvas.width !== elW) {
      state.canvas.width = elW;
    }
    drawMiniCanvas(chart, state);
  },

  uninstall(chart) {
    const state = states.get(chart);
    if (state) {
      state.abort.abort();
      state.resizeObserver.disconnect();
      state.canvas.remove();
      states.delete(chart);
    }
  },
};
