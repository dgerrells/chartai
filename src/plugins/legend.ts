import type { ChartPlugin, ChartConfig, InternalChart } from "../types.ts";
import { ChartManager } from "../chart-library.ts";
import { DEFAULT_FONT, DEFAULT_LABEL_SIZE } from "./labels.ts";

export interface LegendConfig {
  maxLabelChars?: number;
  fontFamily?: string;
  labelSize?: number;
  textColor?: string;
  defaultOpen?: boolean;
  alwaysOpen?: boolean;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    legend: LegendConfig;
  }
}

const ICON_SIZE = 28;
const PANEL_MAX_WIDTH = 220;
const PANEL_MIN_WIDTH = 100;
const DEFAULT_MAX_LABEL_CHARS = 24;

interface LegendState {
  overlay: HTMLDivElement;
  container: HTMLDivElement;
  iconBtn: HTMLButtonElement;
  panel: HTMLDivElement;
  closeBtn: HTMLButtonElement;
  scrollArea: HTMLDivElement;
  list: HTMLDivElement;
  open: boolean;
  abort: AbortController;
  lastSeriesKey: string;
  computedWidth: number;
}

const states = new WeakMap<InternalChart, LegendState>();

function getLegendConfig(chart: InternalChart<ChartConfig & LegendConfig>) {
  return (chart.config as { legend?: LegendConfig }).legend ?? {};
}

function getLegendStyles(chart: InternalChart<ChartConfig & LegendConfig>) {
  const dark = ChartManager.isDark;
  const bgc =
    chart.config.bgColor ?? (dark ? [0.11, 0.11, 0.12] : [0.98, 0.98, 0.98]);
  const rgb = `${Math.round(bgc[0] * 255)},${Math.round(bgc[1] * 255)},${Math.round(bgc[2] * 255)}`;
  const border = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const panelBg = dark ? `rgba(${rgb},0.95)` : "rgba(255,255,255,0.98)";
  const closeBg = dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.98)";
  return {
    panelBg,
    panelBorder: border,
    closeBg,
    closeBgSolid: dark ? "rgba(0.2,0.2,0.22,0.98)" : "rgba(255,255,255,0.98)",
    text:
      getLegendConfig(chart).textColor ??
      chart.config.textColor ??
      (dark ? "#c0c0c0" : "#333333"),
    textMuted: dark ? "#888" : "#999",
    font:
      getLegendConfig(chart).fontFamily ??
      chart.config.fontFamily ??
      DEFAULT_FONT,
    labelSize:
      getLegendConfig(chart).labelSize ??
      chart.config.labelSize ??
      DEFAULT_LABEL_SIZE,
  };
}

const CLOSE_BTN_SIZE = Math.round(ICON_SIZE * 0.8);
const PANEL_MAX_HEIGHT = 180;

const LEGEND_HTML = `
<div class="chart-legend-overlay" style="position:absolute;inset:0;pointer-events:none;z-index:20">
  <div class="chart-legend-container" style="position:absolute;top:4px;right:4px;width:${ICON_SIZE}px;height:${ICON_SIZE}px;overflow:hidden;border-radius:50%;pointer-events:auto;transition:width .2s ease,height .2s ease,border-radius .2s ease">
    <button type="button" class="chart-legend-icon" title="Legend" style="position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:none;border-radius:inherit;cursor:pointer;flex-shrink:0;transition:transform .18s ease,opacity .2s ease"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg></button>
    <div class="chart-legend-panel" style="position:absolute;inset:0;display:none;flex-direction:column;overflow:hidden;border-radius:inherit">
      <div class="chart-legend-scroll" style="flex:1;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:10px 12px">
        <div class="chart-legend-list" style="display:flex;flex-direction:column;gap:4px"></div>
      </div>
    </div>
  </div>
  <button type="button" class="chart-legend-close" title="Close" style="position:absolute;top:-${CLOSE_BTN_SIZE / 2}px;right:-${CLOSE_BTN_SIZE / 2}px;width:${CLOSE_BTN_SIZE}px;height:${CLOSE_BTN_SIZE}px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:none;cursor:pointer;padding:0;pointer-events:none;opacity:0;visibility:hidden;transition:transform .12s ease,opacity .18s ease .1s;z-index:21;transform:translate(-50%,50%);"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button>
</div>`;

export const legendPlugin: ChartPlugin<LegendConfig> = {
  name: "legend",

  install(chart, el) {
    const ac = new AbortController();
    const wrap = document.createElement("div");
    wrap.innerHTML = LEGEND_HTML.trim();
    const overlay = wrap.firstElementChild as HTMLDivElement;
    const container = overlay.querySelector(".chart-legend-container")!;
    const iconBtn = container.querySelector(".chart-legend-icon")!;
    const panel = container.querySelector(".chart-legend-panel")!;
    const scrollArea = container.querySelector(".chart-legend-scroll")!;
    const list = scrollArea.querySelector(".chart-legend-list")!;
    const closeBtn = overlay.querySelector(".chart-legend-close")!;

    el.appendChild(overlay);

    iconBtn.addEventListener("mouseenter", () => {
      (iconBtn as HTMLElement).style.transform = "scale(1.08)";
    });
    iconBtn.addEventListener("mouseleave", () => {
      (iconBtn as HTMLElement).style.transform = "scale(1)";
    });
    const closeBase = "translate(-50%, 50%)";
    closeBtn.addEventListener("mouseenter", () => {
      (closeBtn as HTMLElement).style.transform = `${closeBase} scale(1.1)`;
    });
    closeBtn.addEventListener("mouseleave", () => {
      (closeBtn as HTMLElement).style.transform = closeBase;
    });

    scrollArea.addEventListener("wheel", (e) => e.stopPropagation(), {
      passive: false,
      signal: ac.signal,
    });

    list.addEventListener(
      "pointerdown",
      (e) => {
        const row = (e.target as Element).closest<HTMLElement>(
          ".chart-legend-row",
        );
        if (!row) return;
        e.stopPropagation();
        e.preventDefault();
        const idx = Number(row.dataset.series);
        if (isNaN(idx)) return;
        const current = new Set(
          (chart.config as ChartConfig).hiddenSeries ?? [],
        );
        if (current.has(idx)) current.delete(idx);
        else current.add(idx);
        const isNowHidden = current.has(idx);
        const ser = chart.series[idx];
        if (ser) {
          const col = `rgb(${ser.color.r * 100}% ${ser.color.g * 100}% ${ser.color.b * 100}%)`;
          const swatch = row.querySelector<HTMLElement>(
            ".chart-legend-swatch",
          )!;
          const labelEl = row.querySelector<HTMLElement>(
            ".chart-legend-label",
          )!;
          swatch.style.background = isNowHidden ? "transparent" : col;
          swatch.style.border = isNowHidden ? `1.5px solid ${col}` : "";
          labelEl.style.opacity = isNowHidden ? "0.4" : "";
          swatch.classList.remove("chart-legend-swatch--bounce");
          labelEl.classList.remove("chart-legend-label--bounce");
          void swatch.offsetWidth;
          swatch.classList.add("chart-legend-swatch--bounce");
          labelEl.classList.add("chart-legend-label--bounce");
        }
        ChartManager.setHiddenSeries(chart.id, [...current]);
      },
      { capture: true, signal: ac.signal },
    );

    const cfg = getLegendConfig(chart);
    const alwaysOpen = cfg.alwaysOpen ?? false;
    const defaultOpen = cfg.defaultOpen ?? false;

    const s: LegendState = {
      overlay,
      container: container as HTMLDivElement,
      iconBtn: iconBtn as HTMLButtonElement,
      panel: panel as HTMLDivElement,
      closeBtn: closeBtn as HTMLButtonElement,
      scrollArea: scrollArea as HTMLDivElement,
      list: list as HTMLDivElement,
      open: alwaysOpen || defaultOpen,
      abort: ac,
      lastSeriesKey: "",
      computedWidth: PANEL_MAX_WIDTH,
    };
    states.set(chart, s);

    if (!alwaysOpen) {
      const toggle = () => {
        s.open = !s.open;
        applyOpenState(chart);
      };
      iconBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.stopPropagation();
          e.preventDefault();
          toggle();
        },
        { capture: true, signal: ac.signal },
      );
      closeBtn.addEventListener(
        "pointerdown",
        (e) => {
          e.stopPropagation();
          e.preventDefault();
          s.open = false;
          applyOpenState(chart);
        },
        { capture: true, signal: ac.signal },
      );
    }

    applyStyles(chart);
    syncSeries(chart);
    applyOpenState(chart);
  },

  afterDraw(_, chart) {
    applyStyles(chart);
    syncSeries(chart);
  },

  uninstall(chart) {
    const s = states.get(chart);
    if (s) {
      s.abort.abort();
      s.overlay.remove();
      states.delete(chart);
    }
  },
};

function applyStyles(chart: InternalChart<ChartConfig & LegendConfig>) {
  const s = states.get(chart);
  if (!s) return;
  const styles = getLegendStyles(chart);

  const border = `1px solid ${styles.panelBorder}`;
  s.container.style.background = styles.panelBg;
  s.container.style.border = border;
  s.container.style.fontFamily = styles.font;
  s.container.style.fontSize = `${styles.labelSize}px`;
  s.container.style.color = styles.text;

  s.iconBtn.style.background = styles.closeBg;
  s.iconBtn.style.border = "none";
  s.iconBtn.style.boxShadow = "none";
  s.iconBtn.style.color = styles.text;

  s.panel.style.background = styles.panelBg;
  s.panel.style.fontFamily = styles.font;
  s.panel.style.fontSize = `${styles.labelSize}px`;
  s.panel.style.color = styles.text;

  s.closeBtn.style.background = styles.closeBgSolid;
  s.closeBtn.style.border = border;
  s.closeBtn.style.boxShadow = "none";
  s.closeBtn.style.color = styles.text;
}

function seriesKey(chart: InternalChart): string {
  return chart.series.map((s, i) => `${i}:${s.label}`).join("|");
}

function measureTextWidth(
  text: string,
  font: string,
  fontSize: number,
): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${fontSize}px ${font}`;
  return ctx.measureText(text).width;
}

function computePanelWidth(
  chart: InternalChart<ChartConfig & LegendConfig>,
  labels: string[],
): number {
  const styles = getLegendStyles(chart);
  const font = styles.font;
  const fontSize = styles.labelSize;
  const maxChars =
    getLegendConfig(chart).maxLabelChars ?? DEFAULT_MAX_LABEL_CHARS;

  let maxW = 0;
  for (const label of labels) {
    const truncated =
      label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
    const w = measureTextWidth(truncated, font, fontSize);
    if (w > maxW) maxW = w;
  }

  const swatchGap = 18;
  const padding = 44;
  const target = Math.ceil(maxW) + swatchGap + padding;
  return Math.min(Math.max(target, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH);
}

function syncSeries(chart: InternalChart<ChartConfig & LegendConfig>) {
  const s = states.get(chart);
  if (!s) return;
  const key = seriesKey(chart);
  if (key === s.lastSeriesKey) {
    applyHiddenState(chart, s);
    return;
  }
  s.lastSeriesKey = key;
  rebuildRows(chart, s);
}

function rebuildRows(
  chart: InternalChart<ChartConfig & LegendConfig>,
  s: LegendState,
) {
  const series = chart.series;
  const maxChars =
    getLegendConfig(chart).maxLabelChars ?? DEFAULT_MAX_LABEL_CHARS;
  const labels = series.map((ser, i) => ser.label || `Series ${i + 1}`);
  s.computedWidth = computePanelWidth(chart, labels);

  const hidden =
    (chart.config as ChartConfig).hiddenSeries ?? new Set<number>();
  const rowBase =
    "display:flex;align-items:center;gap:8px;min-width:0;padding-right:8px;cursor:pointer;user-select:none";
  const rowAnim =
    ";opacity:0;transform:translateY(6px);animation:chart-legend-row-in .25s cubic-bezier(.34,1.2,.64,1) forwards";
  const swatchBase =
    "width:10px;height:10px;border-radius:2px;flex-shrink:0;box-sizing:border-box";
  const labelBase =
    "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:opacity .15s ease";

  s.list.innerHTML = series
    .map((ser, i) => {
      const col = `rgb(${ser.color.r * 100}% ${ser.color.g * 100}% ${ser.color.b * 100}%)`;
      let label = ser.label || `Series ${i + 1}`;
      if (label.length > maxChars) label = label.slice(0, maxChars - 1) + "…";
      const animDelay = Math.min(0.02 + i * 0.02, 0.02 + 7 * 0.02);
      const isHidden = hidden.has(i);
      const swatchStyle = isHidden
        ? `${swatchBase};background:transparent;border:1.5px solid ${col}`
        : `${swatchBase};background:${col}`;
      const labelOpacity = isHidden ? "opacity:0.4;" : "";
      return `<div class="chart-legend-row" data-series="${i}" style="${rowBase}${rowAnim};animation-delay:${animDelay}s"><span class="chart-legend-swatch" style="${swatchStyle}"></span><span class="chart-legend-label" style="${labelOpacity}${labelBase}">${escapeHtml(label)}</span></div>`;
    })
    .join("");

  if (s.open) {
    const packedH = s.list.scrollHeight + 20;
    s.container.style.width = `${s.computedWidth}px`;
    s.container.style.height = `${Math.min(PANEL_MAX_HEIGHT, packedH)}px`;
  }
}

function applyHiddenState(
  chart: InternalChart<ChartConfig & LegendConfig>,
  s: LegendState,
) {
  const hidden =
    (chart.config as ChartConfig).hiddenSeries ?? new Set<number>();
  s.list.querySelectorAll<HTMLElement>(".chart-legend-row").forEach((row) => {
    const i = Number(row.dataset.series);
    if (isNaN(i)) return;
    const ser = chart.series[i];
    if (!ser) return;
    const col = `rgb(${ser.color.r * 100}% ${ser.color.g * 100}% ${ser.color.b * 100}%)`;
    const isHidden = hidden.has(i);
    const swatch = row.querySelector<HTMLElement>(".chart-legend-swatch")!;
    const labelEl = row.querySelector<HTMLElement>(".chart-legend-label")!;
    swatch.style.background = isHidden ? "transparent" : col;
    swatch.style.border = isHidden ? `1.5px solid ${col}` : "";
    labelEl.style.opacity = isHidden ? "0.4" : "";
  });
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function applyOpenState(chart: InternalChart<ChartConfig & LegendConfig>) {
  const s = states.get(chart);
  if (!s) return;

  const alwaysOpen = getLegendConfig(chart).alwaysOpen ?? false;
  const open = alwaysOpen || s.open;
  s.container.style.width = open ? `${s.computedWidth}px` : `${ICON_SIZE}px`;
  s.container.style.height = `${ICON_SIZE}px`;
  s.container.style.borderRadius = open ? "8px" : "50%";
  s.container.style.overflow = "hidden";
  s.iconBtn.style.opacity = alwaysOpen ? "0" : open ? "0" : "1";
  s.iconBtn.style.pointerEvents = alwaysOpen ? "none" : open ? "none" : "auto";
  s.iconBtn.style.visibility = alwaysOpen ? "hidden" : "visible";
  s.panel.style.display = open ? "flex" : "none";
  s.closeBtn.style.opacity = alwaysOpen ? "0" : open ? "0" : "0";
  s.closeBtn.style.pointerEvents = alwaysOpen ? "none" : open ? "auto" : "none";
  s.closeBtn.style.visibility = alwaysOpen
    ? "hidden"
    : open
      ? "visible"
      : "hidden";

  // Hide scroll overflow during height animation to prevent scrollbar flash
  s.scrollArea.style.overflowY = "hidden";

  if (open) {
    const packedH = s.list.scrollHeight + 20;
    s.container.style.height = `${Math.min(PANEL_MAX_HEIGHT, packedH)}px`;

    const onHeightDone = (e: TransitionEvent) => {
      if (e.propertyName !== "height") return;
      s.container.removeEventListener("transitionend", onHeightDone);
      s.scrollArea.style.overflowY = "auto";
    };
    s.container.addEventListener("transitionend", onHeightDone);

    if (!alwaysOpen) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          s.closeBtn.style.opacity = "1";
        });
      });
    }
  }
}

function injectLegendKeyframes() {
  if (document.getElementById("chart-legend-keyframes")) return;
  const style = document.createElement("style");
  style.id = "chart-legend-keyframes";
  style.textContent = `
    @keyframes chart-legend-row-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes chart-legend-swatch-bounce {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.5); }
      60%  { transform: scale(0.82); }
      80%  { transform: scale(1.12); }
      100% { transform: scale(1); }
    }
    .chart-legend-swatch--bounce { animation: chart-legend-swatch-bounce 0.28s ease-out; }
    @keyframes chart-legend-label-bounce {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.05); }
      60%  { transform: scale(0.97); }
      80%  { transform: scale(1.02); }
      100% { transform: scale(1); }
    }
    .chart-legend-label--bounce { animation: chart-legend-label-bounce 0.28s ease-out; }
    .chart-legend-scroll::-webkit-scrollbar { width: 6px; }
    .chart-legend-scroll::-webkit-scrollbar-track { background: transparent; }
    .chart-legend-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 3px; }
    .chart-legend-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
  `;
  document.head.appendChild(style);
}

injectLegendKeyframes();
