import type { ChartPlugin, InternalChart, ChartConfig } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { DEFAULT_FONT } from "../labels.ts";
import { MARGIN } from "../shared.ts";
import { dataToScreen, screenToData } from "../coords.ts";

export interface TooltipPinConfig {
  pinMax?: number;
  fontFamily?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    "tooltip-pin": TooltipPinConfig;
  }
}

interface Pin {
  dataX: number;
  dataY: number;
  seriesIndex: number;
  seriesLabel: string;
  color: { r: number; g: number; b: number };
}

interface PinState {
  pins: Pin[];
  abort: AbortController;
}

const states = new WeakMap<InternalChart, PinState>();

const MAX_PIN_PX = 30;

function findNearestPin(
  chart: InternalChart,
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): Pin | null {
  if (chart.series.length === 0) return null;
  const { x: dataX, y: dataY } = screenToData(screenX, screenY, chart, width, height);

  let bestSi = -1;
  let bestIdx = -1;
  let bestDx = Infinity;
  let bestDy = Infinity;

  for (let s = 0; s < chart.series.length; s++) {
    const sr = chart.series[s];
    const n = sr.rawX.length;
    if (n === 0) continue;

    let lo = 0,
      hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sr.rawX[mid] < dataX) lo = mid + 1;
      else hi = mid;
    }
    let idx = lo;
    if (lo > 0 && Math.abs(sr.rawX[lo - 1] - dataX) < Math.abs(sr.rawX[lo] - dataX)) {
      idx = lo - 1;
    }

    const dx = Math.abs(sr.rawX[idx] - dataX);
    const dy = Math.abs(sr.rawY[idx] - dataY);
    if (dx < bestDx || (dx === bestDx && dy < bestDy)) {
      bestDx = dx;
      bestDy = dy;
      bestSi = s;
      bestIdx = idx;
    }
  }

  if (bestSi === -1) return null;

  const sr = chart.series[bestSi];
  const { x: candidateSx, y: candidateSy } = dataToScreen(
    sr.rawX[bestIdx],
    sr.rawY[bestIdx],
    chart,
    width,
    height,
  );
  if (Math.hypot(candidateSx - screenX, candidateSy - screenY) > MAX_PIN_PX) return null;

  return {
    dataX: sr.rawX[bestIdx],
    dataY: sr.rawY[bestIdx],
    seriesIndex: bestSi,
    seriesLabel: sr.label,
    color: sr.color,
  };
}

export const tooltipPinPlugin: ChartPlugin<TooltipPinConfig> = {
  name: "tooltip-pin",

  install(chart, el) {
    const ac = new AbortController();
    const state: PinState = { pins: [], abort: ac };
    states.set(chart, state);

    el.addEventListener(
      "click",
      (e) => {
        if (chart.dragging) return;
        const r = el.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;

        for (let i = state.pins.length - 1; i >= 0; i--) {
          const pin = state.pins[i];
          const { x: pinSx, y: pinSy } = dataToScreen(pin.dataX, pin.dataY, chart, r.width, r.height);
          if (Math.hypot(pinSx - sx, pinSy - sy) < 20) {
            state.pins.splice(i, 1);
            e.preventDefault();
            ChartManager.drawChart(chart);
            return;
          }
        }

        const nearest = findNearestPin(chart, sx, sy, r.width, r.height);
        if (!nearest) return;
        e.preventDefault();

        const cfg = chart.config as ChartConfig & TooltipPinConfig;
        const maxPins = cfg.pinMax ?? 5;
        if (state.pins.length >= maxPins) state.pins.shift();
        state.pins.push(nearest);
        ChartManager.drawChart(chart);
      },
      { signal: ac.signal },
    );
  },

  afterDraw(ctx, chart) {
    const state = states.get(chart);
    if (!state || state.pins.length === 0) return;

    const w = chart.width;
    const h = chart.height;
    const m = MARGIN;
    const dark = ChartManager.isDark;
    const cfg = chart.config as ChartConfig & TooltipPinConfig;
    const formatX = cfg.formatX ?? String;
    const formatY = cfg.formatY ?? String;
    const fontFamily = cfg.fontFamily ?? DEFAULT_FONT;

    ctx.save();
    ctx.font = `500 10px ${fontFamily}`;

    for (const pin of state.pins) {
      const { x: pinSx, y: pinSy } = dataToScreen(pin.dataX, pin.dataY, chart, w, h);
      const colRgb = `${Math.round(pin.color.r * 255)},${Math.round(pin.color.g * 255)},${Math.round(pin.color.b * 255)}`;
      const col = `rgb(${colRgb})`;

      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = `rgba(${colRgb},0.4)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pinSx, m.top);
      ctx.lineTo(pinSx, h - m.bottom);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(pinSx, pinSy, 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const xLabel = formatX(pin.dataX);
      const yLabel = `${pin.seriesLabel}: ${formatY(pin.dataY)}`;
      ctx.font = `500 10px ${fontFamily}`;
      const cardW =
        Math.max(ctx.measureText(xLabel).width, ctx.measureText(yLabel).width) + 20;
      const cardH = 14 + 2 * 17;

      let bx = pinSx + 10;
      let by = pinSy - cardH - 8;
      if (bx + cardW > w) bx = pinSx - cardW - 10;
      by = Math.max(m.top + 4, Math.min(h - m.bottom - cardH - 4, by));

      ctx.beginPath();
      ctx.roundRect(bx, by, cardW, cardH, 5);
      ctx.fillStyle = dark ? "rgba(28,28,30,0.94)" : "rgba(255,255,255,0.96)";
      ctx.fill();
      ctx.strokeStyle = `rgba(${colRgb},0.4)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(bx, by, cardW, 3, [5, 5, 0, 0]);
      ctx.fill();

      ctx.font = `500 10px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = dark ? "#888" : "#999";
      ctx.fillText(xLabel, bx + 10, by + 10);
      ctx.fillStyle = dark ? "#eee" : "#1a1a1a";
      ctx.fillText(yLabel, bx + 10, by + 27);
    }

    ctx.restore();
  },

  uninstall(chart) {
    const state = states.get(chart);
    if (state) {
      state.abort.abort();
      states.delete(chart);
    }
  },
};
