import type { ChartPlugin, ChartConfig, InternalChart } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { MARGIN } from "../shared.ts";
import { DEFAULT_FONT } from "../labels.ts";

export type StatsPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface StatsConfig {
  statsPosition?: StatsPosition;
  fontFamily?: string;
  textColor?: string;
  statsPrecision?: number;
  formatValue?: (n: number) => string;
  statsShowSeries?: boolean;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    stats: StatsConfig;
  }
}

interface StatsState {
  overlay: HTMLDivElement;
  header: HTMLDivElement;
  body: HTMLDivElement;
  collapsed: boolean;
  abort: AbortController;
  dragOffset: { x: number; y: number } | null;
  customPos: { x: number; y: number } | null;
  tiltAngle: number;
  tiltVelocity: number;
  tiltRafId: number | null;
}

const states = new WeakMap<InternalChart, StatsState>();

function computeStats(values: number[]) {
  if (values.length === 0) return null;
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / values.length;
  let variance = 0;
  for (const v of values) {
    const d = v - mean;
    variance += d * d;
  }
  const stddev = Math.sqrt(variance / values.length);
  return { min, max, mean, stddev, count: values.length };
}

function updateOverlay(chart: InternalChart<ChartConfig & StatsConfig>, state: StatsState) {
  const { overlay, header, body } = state;

  const dark = ChartManager.isDark;
  const cfg = chart.config as ChartConfig & StatsConfig;
  const bgColor = cfg.bgColor ?? (dark ? [0.11, 0.11, 0.12] : [0.98, 0.98, 0.98]);
  const rgb = bgColor.map((c: number) => Math.round(c * 255)).join(",");
  const panelBg = dark ? `rgba(${rgb},0.92)` : "rgba(255,255,255,0.95)";
  const border = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  const text = cfg.textColor ?? (dark ? "#c0c0c0" : "#333333");
  const muted = dark ? "#777" : "#aaa";
  const font = cfg.fontFamily ?? DEFAULT_FONT;
  const precision = cfg.statsPrecision ?? 2;
  const fmt = cfg.formatValue ?? ((n: number) => n.toFixed(precision));
  const pos: StatsPosition = cfg.statsPosition ?? "top-left";

  // Use individual style properties so we never overwrite position/cursor during drag
  overlay.style.display = "block";
  overlay.style.position = "absolute";
  overlay.style.pointerEvents = "auto";
  overlay.style.zIndex = "15";
  overlay.style.background = panelBg;
  overlay.style.border = `1px solid ${border}`;
  overlay.style.borderRadius = "6px";
  overlay.style.padding = "7px 10px";
  overlay.style.fontFamily = font;
  overlay.style.fontSize = "11px";
  overlay.style.color = text;
  overlay.style.minWidth = "100px";
  overlay.style.userSelect = "none";

  // Only update position when not actively dragging
  if (!state.dragOffset) {
    const m = MARGIN;
    const pad = 6;
    if (state.customPos) {
      overlay.style.top = `${state.customPos.y}px`;
      overlay.style.left = `${state.customPos.x}px`;
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    } else {
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
      overlay.style.top = "auto";
      overlay.style.left = "auto";
      if (pos === "top-left")     { overlay.style.top = `${m.top + pad}px`;    overlay.style.left  = `${m.left + pad}px`; }
      if (pos === "top-right")    { overlay.style.top = `${m.top + pad}px`;    overlay.style.right = `${m.right + pad}px`; overlay.style.left = "auto"; }
      if (pos === "bottom-left")  { overlay.style.bottom = `${m.bottom + pad}px`; overlay.style.left = `${m.left + pad}px`; overlay.style.top = "auto"; }
      if (pos === "bottom-right") { overlay.style.bottom = `${m.bottom + pad}px`; overlay.style.right = `${m.right + pad}px`; overlay.style.top = "auto"; overlay.style.left = "auto"; }
    }
  }

  if (state.collapsed) {
    header.innerHTML = `<span style="color:${muted};font-size:10px;font-weight:600;letter-spacing:.04em;cursor:grab">STATS &#9660;</span>`;
    body.innerHTML = "";
    return;
  }

  const { bounds: b, view: v } = chart;
  const fullX = b.maxX - b.minX;
  const visMinX = b.minX + v.panX * fullX;
  const visMaxX = visMinX + fullX / v.zoomX;

  const allValues: number[] = [];
  for (const s of chart.series) {
    let lo = 0, hi = s.rawX.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s.rawX[mid] < visMinX) lo = mid + 1;
      else hi = mid;
    }
    const start = lo;
    lo = 0; hi = s.rawX.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s.rawX[mid] <= visMaxX) lo = mid + 1;
      else hi = mid;
    }
    const end = lo;
    for (let i = start; i < end; i++) allValues.push(s.rawY[i]);
  }

  const stats = computeStats(allValues);
  if (!stats) {
    overlay.style.display = "none";
    return;
  }

  header.innerHTML = `<div style="margin-bottom:4px"><span style="color:${muted};font-size:10px;font-weight:600;letter-spacing:.04em;cursor:grab">STATS &#9650;</span></div>`;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:auto auto;gap:1px 10px">
      <span style="color:${muted}">min</span><span>${fmt(stats.min)}</span>
      <span style="color:${muted}">max</span><span>${fmt(stats.max)}</span>
      <span style="color:${muted}">avg</span><span>${fmt(stats.mean)}</span>
      <span style="color:${muted}">&#963;</span><span>${fmt(stats.stddev)}</span>
      <span style="color:${muted}">n</span><span>${stats.count.toLocaleString()}</span>
    </div>`;
}

export const statsPlugin: ChartPlugin<StatsConfig> = {
  name: "stats",

  install(chart, el) {
    const ac = new AbortController();
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;pointer-events:auto;z-index:15;";
    const header = document.createElement("div");
    const body = document.createElement("div");
    overlay.appendChild(header);
    overlay.appendChild(body);
    el.appendChild(overlay);

    const state: StatsState = { overlay, header, body, collapsed: false, abort: ac, dragOffset: null, customPos: null, tiltAngle: 0, tiltVelocity: 0, tiltRafId: null };
    states.set(chart, state);

    header.addEventListener(
      "click",
      () => {
        state.collapsed = !state.collapsed;
        updateOverlay(chart as InternalChart<ChartConfig & StatsConfig>, state);
      },
      { signal: ac.signal },
    );

    overlay.addEventListener(
      "pointerdown",
      (e) => {
        e.stopPropagation();
        if (!state.customPos) {
          state.customPos = { x: overlay.offsetLeft, y: overlay.offsetTop };
          overlay.style.left = state.customPos.x + "px";
          overlay.style.top = state.customPos.y + "px";
          overlay.style.right = "auto";
          overlay.style.bottom = "auto";
        }
        state.dragOffset = { x: 0, y: 0 };
        if (state.tiltRafId !== null) {
          cancelAnimationFrame(state.tiltRafId);
          state.tiltRafId = null;
        }
        overlay.setPointerCapture(e.pointerId);
        overlay.style.cursor = "grabbing";
      },
      { signal: ac.signal },
    );

    overlay.addEventListener(
      "pointermove",
      (e) => {
        if (!state.dragOffset || !state.customPos) return;
        const x = Math.max(0, Math.min(state.customPos.x + e.movementX, el.clientWidth - overlay.offsetWidth));
        const y = Math.max(0, Math.min(state.customPos.y + e.movementY, el.clientHeight - overlay.offsetHeight));
        state.customPos = { x, y };
        overlay.style.left = x + "px";
        overlay.style.top = y + "px";
        state.tiltVelocity = state.tiltVelocity * 0.6 + e.movementX * 0.4;
        state.tiltAngle = Math.max(-15, Math.min(15, state.tiltVelocity * 1.5));
        overlay.style.transform = `rotate(${state.tiltAngle}deg)`;
      },
      { signal: ac.signal },
    );

    overlay.addEventListener(
      "pointerup",
      () => {
        state.dragOffset = null;
        overlay.style.cursor = "";
        const decayTilt = () => {
          state.tiltAngle *= 0.78;
          state.tiltVelocity *= 0.78;
          if (Math.abs(state.tiltAngle) > 0.05) {
            overlay.style.transform = `rotate(${state.tiltAngle}deg)`;
            state.tiltRafId = requestAnimationFrame(decayTilt);
          } else {
            state.tiltAngle = 0;
            state.tiltVelocity = 0;
            overlay.style.transform = "";
            state.tiltRafId = null;
          }
        };
        state.tiltRafId = requestAnimationFrame(decayTilt);
      },
      { signal: ac.signal },
    );
  },

  afterDraw(_, chart) {
    const state = states.get(chart);
    if (!state) return;
    updateOverlay(chart as InternalChart<ChartConfig & StatsConfig>, state);
  },

  uninstall(chart) {
    const state = states.get(chart);
    if (state) {
      if (state.tiltRafId !== null) cancelAnimationFrame(state.tiltRafId);
      state.abort.abort();
      state.overlay.remove();
      states.delete(chart);
    }
  },
};
