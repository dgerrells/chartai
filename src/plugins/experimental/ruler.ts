import type { ChartPlugin, ChartConfig, InternalChart } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { DEFAULT_FONT } from "../labels.ts";
import { MARGIN } from "../shared.ts";
import { dataToScreen, screenToData } from "../coords.ts";

export type RulerAxis = "x" | "y" | "both";

export interface RulerConfig {
  rulerAxis?: RulerAxis;
  rulerMax?: number;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  rulerColor?: string;
  fontFamily?: string;
  rulerPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    ruler: RulerConfig;
  }
}

interface RulerPoint {
  dataX: number;
  dataY: number;
}

interface Ruler {
  a: RulerPoint;
  b: RulerPoint;
}

interface RulerState {
  rulers: Ruler[];
  pending: RulerPoint | null;
  cursorDataX: number;
  cursorDataY: number;
  active: boolean;
  justToggledButton: boolean;
  abort: AbortController;
  button: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  wrapper: HTMLDivElement;
}

const states = new WeakMap<InternalChart, RulerState>();

const ENDPOINT_HIT_PX = 12;

function showClearBtn(btn: HTMLButtonElement, visible: boolean) {
  const isVisible = btn.hasAttribute("data-visible");
  if (visible === isVisible) return;
  btn.style.transform = "";
  if (visible) {
    btn.setAttribute("data-visible", "");
  } else {
    btn.removeAttribute("data-visible");
  }
}

function injectRulerStyles() {
  if (document.getElementById("chart-ruler-styles")) return;
  const style = document.createElement("style");
  style.id = "chart-ruler-styles";
  style.textContent = `
@layer chartai.ruler {
  .chart-ruler-wrapper {
    position: absolute;
    z-index: 1000;
    pointer-events: none;
    display: inline-block;
  }
  .chart-ruler-btn {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1.5px solid var(--ruler-btn-border);
    background: var(--ruler-btn-bg);
    color: var(--ruler-btn-color);
    z-index: 100;
    cursor: pointer;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  }
  .chart-ruler-btn[data-active] {
    --ruler-btn-border: var(--ruler-active-border);
    --ruler-btn-bg: var(--ruler-active-bg);
    --ruler-btn-color: var(--ruler-active-color);
  }
  .chart-ruler-clear {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid oklch(from var(--ruler-active-color) calc(l * 0.7) c h / 1);
    background: oklch(from var(--ruler-active-color) calc(l * 0.22) c h / 1);
    color: var(--ruler-active-color);
    z-index: 101;
    cursor: pointer;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.22);
    opacity: 0;
    transform: scale(0.5);
    transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.4, 0, 1, 1);
  }
  .chart-ruler-clear[data-visible] {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
    transition: opacity 0.22s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}`;
  document.head.appendChild(style);
}

function applyTheme(el: HTMLElement, dark: boolean) {
  const s = el.style;
  if (dark) {
    s.setProperty("--ruler-btn-border", "rgba(255,255,255,0.2)");
    s.setProperty("--ruler-btn-bg", "rgba(30,30,32,0.88)");
    s.setProperty("--ruler-btn-color", "rgba(200,200,200,0.9)");
    s.setProperty("--ruler-active-border", "rgba(255,200,50,0.8)");
    s.setProperty("--ruler-active-bg", "rgba(255,200,50,0.2)");
    s.setProperty("--ruler-active-color", "rgba(255,200,50,0.95)");
    s.setProperty("--ruler-clear-border", "rgba(255,255,255,0.18)");
    s.setProperty("--ruler-clear-bg", "rgba(30,30,32,0.95)");
    s.setProperty("--ruler-clear-color", "rgba(200,200,200,0.9)");
  } else {
    s.setProperty("--ruler-btn-border", "rgba(0,0,0,0.15)");
    s.setProperty("--ruler-btn-bg", "rgba(255,255,255,0.92)");
    s.setProperty("--ruler-btn-color", "rgba(80,80,80,0.9)");
    s.setProperty("--ruler-active-border", "rgba(180,100,0,0.8)");
    s.setProperty("--ruler-active-bg", "rgba(180,100,0,0.12)");
    s.setProperty("--ruler-active-color", "rgba(180,100,0,0.95)");
    s.setProperty("--ruler-clear-border", "rgba(0,0,0,0.13)");
    s.setProperty("--ruler-clear-bg", "rgba(255,255,255,0.97)");
    s.setProperty("--ruler-clear-color", "rgba(80,80,80,0.9)");
  }
}

function setWrapperPosition(el: HTMLElement, pos: string = "bottom-right") {
  const m = MARGIN;
  const pad = 8;
  el.style.removeProperty("top");
  el.style.removeProperty("bottom");
  el.style.removeProperty("left");
  el.style.removeProperty("right");
  switch (pos) {
    case "top-left":
      el.style.top = `${m.top + pad}px`;
      el.style.left = `${m.left + pad}px`;
      break;
    case "top-right":
      el.style.top = `${m.top + pad}px`;
      el.style.right = `${m.right + pad}px`;
      break;
    case "bottom-right":
      el.style.bottom = `${m.bottom + pad}px`;
      el.style.right = `${m.right + pad}px`;
      break;
    default:
      el.style.bottom = `${m.bottom + pad}px`;
      el.style.left = `${m.left + pad}px`;
  }
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
  fontFamily: string,
  dark: boolean,
) {
  ctx.font = `500 11px ${fontFamily}`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 16;
  const ph = 20;
  const px = cx - pw / 2;
  const py = cy - ph / 2;

  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 5);
  ctx.fillStyle = dark ? "rgba(20,20,22,0.90)" : "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
}

function drawEndpoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  dark: boolean,
) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawRulerShape(
  ctx: CanvasRenderingContext2D,
  a: RulerPoint,
  b: RulerPoint,
  axis: RulerAxis,
  chart: InternalChart,
  w: number,
  h: number,
  color: string,
  formatX: (v: number) => string,
  formatY: (v: number) => string,
  fontFamily: string,
  dark: boolean,
) {
  const sa = dataToScreen(a.dataX, a.dataY, chart, w, h);
  const sb = dataToScreen(b.dataX, b.dataY, chart, w, h);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);

  const TICK = 6;

  if (axis === "x") {
    const midY = (sa.y + sb.y) / 2;
    ctx.beginPath();
    ctx.moveTo(sa.x, midY);
    ctx.lineTo(sb.x, midY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(sa.x, midY - TICK);
    ctx.lineTo(sa.x, midY + TICK);
    ctx.moveTo(sb.x, midY - TICK);
    ctx.lineTo(sb.x, midY + TICK);
    ctx.stroke();

    drawEndpoint(ctx, sa.x, sa.y, color, dark);
    drawEndpoint(ctx, sb.x, sb.y, color, dark);

    const labelX = (sa.x + sb.x) / 2;
    const labelY = midY - 16;
    const dx = Math.abs(b.dataX - a.dataX);
    drawPill(
      ctx,
      `\u0394X: ${formatX(dx)}`,
      labelX,
      labelY,
      color,
      fontFamily,
      dark,
    );
  } else if (axis === "y") {
    const midX = (sa.x + sb.x) / 2;
    ctx.beginPath();
    ctx.moveTo(midX, sa.y);
    ctx.lineTo(midX, sb.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(midX - TICK, sa.y);
    ctx.lineTo(midX + TICK, sa.y);
    ctx.moveTo(midX - TICK, sb.y);
    ctx.lineTo(midX + TICK, sb.y);
    ctx.stroke();

    drawEndpoint(ctx, sa.x, sa.y, color, dark);
    drawEndpoint(ctx, sb.x, sb.y, color, dark);

    const labelX = midX + 20;
    const labelY = (sa.y + sb.y) / 2;
    const dy = Math.abs(b.dataY - a.dataY);
    drawPill(
      ctx,
      `\u0394Y: ${formatY(dy)}`,
      labelX,
      labelY,
      color,
      fontFamily,
      dark,
    );
  } else {
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();

    drawEndpoint(ctx, sa.x, sa.y, color, dark);
    drawEndpoint(ctx, sb.x, sb.y, color, dark);

    const labelX = (sa.x + sb.x) / 2;
    const labelY = (sa.y + sb.y) / 2 - 18;
    const dx = Math.abs(b.dataX - a.dataX);
    const dy = Math.abs(b.dataY - a.dataY);
    drawPill(
      ctx,
      `\u0394X: ${formatX(dx)}  \u0394Y: ${formatY(dy)}`,
      labelX,
      labelY,
      color,
      fontFamily,
      dark,
    );
  }

  ctx.restore();
}

export const rulerPlugin: ChartPlugin<RulerConfig> = {
  name: "ruler",

  install(chart, el) {
    injectRulerStyles();
    const ac = new AbortController();
    const cfg = chart.config as ChartConfig & RulerConfig;

    const dark = ChartManager.isDark;

    const wrapper = document.createElement("div");
    wrapper.className = "chart-ruler-wrapper";
    setWrapperPosition(wrapper, cfg.rulerPosition);
    applyTheme(wrapper, dark);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chart-ruler-btn";
    button.title = "Toggle ruler tool";
    button.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="4.5" width="12" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/><line x1="3.5" y1="4.5" x2="3.5" y2="7" stroke="currentColor" stroke-width="1.2"/><line x1="5.5" y1="4.5" x2="5.5" y2="6" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="4.5" x2="7" y2="7" stroke="currentColor" stroke-width="1.2"/><line x1="8.5" y1="4.5" x2="8.5" y2="6" stroke="currentColor" stroke-width="1.2"/><line x1="10.5" y1="4.5" x2="10.5" y2="7" stroke="currentColor" stroke-width="1.2"/></svg>`;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "chart-ruler-clear";
    clearBtn.title = "Clear all rulers";
    clearBtn.innerHTML = `<svg width="5" height="5" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="5" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="1" x2="1" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

    wrapper.appendChild(button);
    wrapper.appendChild(clearBtn);
    el.appendChild(wrapper);

    const state: RulerState = {
      rulers: [],
      pending: null,
      cursorDataX: 0,
      cursorDataY: 0,
      active: false,
      justToggledButton: false,
      abort: ac,
      button,
      clearBtn,
      wrapper,
    };
    states.set(chart, state);

    button.addEventListener(
      "pointerdown",
      (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        state.active = !state.active;
        if (!state.active) state.pending = null;
        state.justToggledButton = true;
        if (state.active) button.dataset.active = "";
        else delete button.dataset.active;
        ChartManager.drawChart(chart);
      },
      { signal: ac.signal },
    );

    clearBtn.addEventListener(
      "pointerdown",
      (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        clearBtn.style.transform = "scale(0.78)";
        state.rulers = [];
        state.pending = null;
        state.justToggledButton = true;
        ChartManager.drawChart(chart);
      },
      { signal: ac.signal },
    );

    clearBtn.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
      },
      { signal: ac.signal },
    );

    el.addEventListener(
      "mousemove",
      (e) => {
        const r = el.getBoundingClientRect();
        const { x, y } = screenToData(
          e.clientX - r.left,
          e.clientY - r.top,
          chart,
          r.width,
          r.height,
        );
        state.cursorDataX = x;
        state.cursorDataY = y;
        if (state.active || state.pending !== null) {
          ChartManager.drawChart(chart);
        }
        e.preventDefault();
      },
      { signal: ac.signal },
    );

    el.addEventListener(
      "click",
      (e) => {
        if (!state.active) return;
        if (state.justToggledButton) {
          state.justToggledButton = false;
          return;
        }
        if (chart.dragging) return;
        e.preventDefault();

        const r = el.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const { x: dataX, y: dataY } = screenToData(
          sx,
          sy,
          chart,
          r.width,
          r.height,
        );

        for (let i = state.rulers.length - 1; i >= 0; i--) {
          const ruler = state.rulers[i];
          const sa = dataToScreen(
            ruler.a.dataX,
            ruler.a.dataY,
            chart,
            r.width,
            r.height,
          );
          const sb = dataToScreen(
            ruler.b.dataX,
            ruler.b.dataY,
            chart,
            r.width,
            r.height,
          );
          const dA = Math.hypot(sa.x - sx, sa.y - sy);
          const dB = Math.hypot(sb.x - sx, sb.y - sy);
          if (dA <= ENDPOINT_HIT_PX || dB <= ENDPOINT_HIT_PX) {
            state.rulers.splice(i, 1);
            ChartManager.drawChart(chart);
            return;
          }
        }

        if (state.pending === null) {
          state.pending = { dataX, dataY };
        } else {
          const rulerMax =
            (chart.config as ChartConfig & RulerConfig).rulerMax ?? 10;
          if (state.rulers.length >= rulerMax) state.rulers.shift();
          state.rulers.push({ a: state.pending, b: { dataX, dataY } });
          state.pending = null;
          ChartManager.drawChart(chart);
        }
      },
      { signal: ac.signal },
    );

    el.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
        if (state.pending !== null) {
          state.pending = null;
        } else {
          const r = el.getBoundingClientRect();
          const sx = e.clientX - r.left;
          const sy = e.clientY - r.top;
          let bestIdx = -1;
          let bestDist = Infinity;
          for (let i = 0; i < state.rulers.length; i++) {
            const ruler = state.rulers[i];
            const sa = dataToScreen(
              ruler.a.dataX,
              ruler.a.dataY,
              chart,
              r.width,
              r.height,
            );
            const sb = dataToScreen(
              ruler.b.dataX,
              ruler.b.dataY,
              chart,
              r.width,
              r.height,
            );
            const dA = Math.hypot(sa.x - sx, sa.y - sy);
            const dB = Math.hypot(sb.x - sx, sb.y - sy);
            const d = Math.min(dA, dB);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
          if (bestIdx !== -1) state.rulers.splice(bestIdx, 1);
        }
        ChartManager.drawChart(chart);
      },
      { signal: ac.signal },
    );

    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && state.active) {
          state.pending = null;
          ChartManager.drawChart(chart);
        }
      },
      { signal: ac.signal },
    );
  },

  afterDraw(ctx, chart) {
    const state = states.get(chart);
    if (!state) return;

    const w = chart.width;
    const h = chart.height;
    const dark = ChartManager.isDark;
    const cfg = chart.config as ChartConfig & RulerConfig;
    const axis: RulerAxis = cfg.rulerAxis ?? "x";
    const color =
      cfg.rulerColor ?? (dark ? "rgba(255,200,50,0.9)" : "rgba(180,100,0,0.9)");
    const formatX = cfg.formatX ?? String;
    const formatY = cfg.formatY ?? String;
    const fontFamily = cfg.fontFamily ?? DEFAULT_FONT;

    setWrapperPosition(state.wrapper, cfg.rulerPosition);
    applyTheme(state.wrapper, dark);
    if (state.active) state.button.dataset.active = "";
    else delete state.button.dataset.active;
    showClearBtn(state.clearBtn, state.rulers.length > 0);

    ctx.save();

    for (const ruler of state.rulers) {
      drawRulerShape(
        ctx,
        ruler.a,
        ruler.b,
        axis,
        chart,
        w,
        h,
        color,
        formatX,
        formatY,
        fontFamily,
        dark,
      );
    }

    if (state.pending !== null) {
      const cursor: RulerPoint = {
        dataX: state.cursorDataX,
        dataY: state.cursorDataY,
      };
      drawRulerShape(
        ctx,
        state.pending,
        cursor,
        axis,
        chart,
        w,
        h,
        color,
        formatX,
        formatY,
        fontFamily,
        dark,
      );

      const sc = dataToScreen(
        state.cursorDataX,
        state.cursorDataY,
        chart,
        w,
        h,
      );
      ctx.save();
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, 5, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  },

  uninstall(chart) {
    const state = states.get(chart);
    if (!state) return;
    state.abort.abort();
    state.wrapper.remove();
    states.delete(chart);
  },
};
