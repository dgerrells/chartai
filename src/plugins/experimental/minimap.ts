import type { ChartPlugin, InternalChart, ChartConfig } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { MARGIN } from "../shared.ts";

export type MinimapPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface MinimapConfig {
  minimapPosition?: MinimapPosition;
  minimapSize?: number;
  minimapOpacity?: number;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    minimap: MinimapConfig;
  }
}

interface MinimapState {
  abort: AbortController;
  drag: { startFx: number; startFy: number; startPanX: number; startPanY: number } | null;
  didDrag: boolean;
}

const states = new WeakMap<InternalChart, MinimapState>();

function getMinimapOrigin(
  pos: MinimapPosition,
  mSize: number,
  cw: number,
  ch: number,
): { mx: number; my: number } {
  const pad = 8;
  const m = MARGIN;
  switch (pos) {
    case "top-left":
      return { mx: m.left + pad, my: m.top + pad };
    case "top-right":
      return { mx: cw - m.right - mSize - pad, my: m.top + pad };
    case "bottom-left":
      return { mx: m.left + pad, my: ch - m.bottom - mSize - pad };
    case "bottom-right":
      return { mx: cw - m.right - mSize - pad, my: ch - m.bottom - mSize - pad };
  }
}

export const minimapPlugin: ChartPlugin<MinimapConfig> = {
  name: "minimap",

  install(chart, el) {
    const ac = new AbortController();
    states.set(chart, { abort: ac, drag: null, didDrag: false });

    const getMinimapCoords = (e: PointerEvent | MouseEvent) => {
      const cfg = chart.config as ChartConfig & MinimapConfig;
      const mSize = cfg.minimapSize ?? 120;
      const pos: MinimapPosition = cfg.minimapPosition ?? "bottom-right";
      const { width: cw, height: ch } = chart;
      const r = el.getBoundingClientRect();
      const scaleX = cw / r.width;
      const scaleY = ch / r.height;
      const cx = (e.clientX - r.left) * scaleX;
      const cy = (e.clientY - r.top) * scaleY;
      const { mx, my } = getMinimapOrigin(pos, mSize, cw, ch);
      return { cx, cy, mx, my, mSize };
    };

    el.addEventListener(
      "pointerdown",
      (e) => {
        const { cx, cy, mx, my, mSize } = getMinimapCoords(e);
        if (cx < mx || cx > mx + mSize || cy < my || cy > my + mSize) return;

        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const state = states.get(chart);
        if (!state) return;

        const fx = (cx - mx) / mSize;
        const fy = (cy - my) / mSize;
        state.drag = {
          startFx: fx,
          startFy: fy,
          startPanX: chart.view.panX,
          startPanY: chart.view.panY,
        };
      },
      { signal: ac.signal },
    );

    window.addEventListener(
      "pointermove",
      (e) => {
        const state = states.get(chart);
        if (!state?.drag) return;
        if (e.buttons === 0) { state.drag = null; return; }

        const { cx, cy, mx, my, mSize } = getMinimapCoords(e);
        const fx = (cx - mx) / mSize;
        const fy = (cy - my) / mSize;
        const dfx = fx - state.drag.startFx;
        const dfy = fy - state.drag.startFy;

        const hv = chart.homeView;
        chart.view.panX = Math.max(
          hv.panX,
          Math.min(hv.panX + 1 / hv.zoomX - 1 / chart.view.zoomX, state.drag.startPanX + dfx / hv.zoomX),
        );
        // fy increases downward (screen), but panY increases upward (data), so invert
        chart.view.panY = Math.max(
          hv.panY,
          Math.min(hv.panY + 1 / hv.zoomY - 1 / chart.view.zoomY, state.drag.startPanY - dfy / hv.zoomY),
        );
        if (Math.abs(dfx) > 0.005 || Math.abs(dfy) > 0.005) state.didDrag = true;
        ChartManager.requestRender(chart.id);
        ChartManager.drawChart(chart);
      },
      { signal: ac.signal },
    );

    window.addEventListener(
      "pointerup",
      () => {
        const state = states.get(chart);
        if (state) {
          if (state.drag) {
            setTimeout(() => { if (state) state.didDrag = false; }, 50);
          }
          state.drag = null;
        }
      },
      { signal: ac.signal },
    );

    el.addEventListener(
      "click",
      (e) => {
        const state = states.get(chart);
        if (!state) return;
        if (state.didDrag) {
          state.didDrag = false;
          return;
        }

        const { cx, cy, mx, my, mSize } = getMinimapCoords(e);
        if (cx < mx || cx > mx + mSize || cy < my || cy > my + mSize) return;

        e.preventDefault();
        e.stopPropagation();
        const fx = (cx - mx) / mSize;
        const fy = (cy - my) / mSize;
        const fyData = 1 - fy;
        const hv = chart.homeView;
        chart.view.panX = Math.max(
          hv.panX,
          Math.min(hv.panX + 1 / hv.zoomX - 1 / chart.view.zoomX, hv.panX + fx / hv.zoomX - 0.5 / chart.view.zoomX),
        );
        chart.view.panY = Math.max(
          hv.panY,
          Math.min(hv.panY + 1 / hv.zoomY - 1 / chart.view.zoomY, hv.panY + fyData / hv.zoomY - 0.5 / chart.view.zoomY),
        );
        ChartManager.requestRender(chart.id);
        ChartManager.drawChart(chart);
      },
      { signal: ac.signal },
    );
  },

  afterDraw(ctx, chart) {
    const cfg = chart.config as ChartConfig & MinimapConfig;
    const mSize = cfg.minimapSize ?? 120;
    const opacity = cfg.minimapOpacity ?? 0.85;
    const pos: MinimapPosition = cfg.minimapPosition ?? "bottom-right";
    const { width: cw, height: ch } = chart;
    const dark = ChartManager.isDark;

    const { mx, my } = getMinimapOrigin(pos, mSize, cw, ch);
    const mw = mSize;
    const mh = mSize;
    const borderR = 6;
    const innerPad = 4;

    ctx.save();
    ctx.globalAlpha = opacity;

    const bgColor = cfg.bgColor ?? (dark ? [0.11, 0.11, 0.12] : [0.98, 0.98, 0.98]);
    ctx.fillStyle = `rgb(${bgColor.map((c: number) => Math.round(c * 255)).join(",")})`;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, borderR);
    ctx.fill();
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(mx + 1, my + 1, mw - 2, mh - 2, borderR - 1);
    ctx.clip();

    const { bounds: b } = chart;
    const rangeX = b.maxX - b.minX || 1;
    const rangeY = b.maxY - b.minY || 1;

    for (const series of chart.series) {
      if (series.rawX.length === 0) continue;
      const { r, g, b: bv } = series.color;
      ctx.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(bv * 255)},0.7)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(series.rawX.length / mw));
      for (let i = 0; i < series.rawX.length; i += step) {
        const px =
          mx + innerPad + ((series.rawX[i] - b.minX) / rangeX) * (mw - innerPad * 2);
        const py =
          my +
          innerPad +
          (1 - (series.rawY[i] - b.minY) / rangeY) * (mh - innerPad * 2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    const { view: v } = chart;
    const hv = chart.homeView;
    const homeRangeX = 1 / hv.zoomX;
    const homeRangeY = 1 / hv.zoomY;
    const vx = mx + innerPad + (v.panX - hv.panX) * hv.zoomX * (mw - innerPad * 2);
    const vy = my + innerPad + (1 - (v.panY - hv.panY) * hv.zoomY - (1 / v.zoomY) / homeRangeY) * (mh - innerPad * 2);
    const vw = (1 / v.zoomX) / homeRangeX * (mw - innerPad * 2);
    const vh = (1 / v.zoomY) / homeRangeY * (mh - innerPad * 2);

    ctx.fillStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(0,100,255,0.1)";
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(0,100,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.restore();
  },

  uninstall(chart) {
    const s = states.get(chart);
    if (s) {
      s.abort.abort();
      states.delete(chart);
    }
  },
};
