// GPU Charts Demo - Consuming the ChartManager library

import { ChartManager, registerPlugin } from "../../src/chart-library.ts";
import type {
  ChartType,
  ChartConfig,
  ChartSeries,
  ZoomMode,
} from "../../src/chart-library.ts";
import { labelsPlugin } from "../../src/plugins/labels.ts";
import { zoomPlugin } from "../../src/plugins/zoom.ts";
import { hoverPlugin } from "../../src/plugins/hover.ts";

registerPlugin(labelsPlugin);
registerPlugin(zoomPlugin());
registerPlugin(hoverPlugin);

type DataPattern = "stock" | "trending" | "declining" | "spikey" | "cyclic";

interface ChartInstance {
  id: string;
  type: ChartType;
  pointCount: number;
  zoomX: boolean;
  zoomY: boolean;
}

const chartInstances: ChartInstance[] = [];
let manager: ChartManager;
let isDark = document.documentElement.classList.contains("dark");

// --- Main-thread frame timing (outside the chart library) ---
let _currentMainMs = 0;
const _frameChannel = new MessageChannel();
let _frameT0 = 0;
let _lastDisplayUpdate = 0;

_frameChannel.port1.onmessage = () => {
  _currentMainMs = performance.now() - _frameT0;
  const now = performance.now();

  if (now - _lastDisplayUpdate >= 120) {
    _lastDisplayUpdate = now;
    const fmt = (ms: number) =>
      ms < 1 ? ms.toFixed(2) + "ms" : ms.toFixed(1) + "ms";
    document.getElementById("main-ms")!.textContent = fmt(_currentMainMs);
  }
};

function _measureFrame() {
  requestAnimationFrame(() => {
    _frameT0 = performance.now();
    // MessageChannel callback fires after all rAF callbacks + microtasks + paint
    _frameChannel.port2.postMessage(null);
    _measureFrame();
  });
}
_measureFrame();

// Base date for stock data - each data point is one day before
const BASE_DATE = new Date("2026-02-03");

function generateData(
  count: number,
  pattern: DataPattern,
): { x: number[]; y: number[] } {
  // Pre-allocate arrays — avoids push() overhead and repeated capacity growth
  const x = new Array<number>(count);
  const y = new Array<number>(count);

  // Only stock uses date-based X axis (minutes ago)
  const isDateAxis = pattern === "stock";

  if (isDateAxis) {
    for (let i = 0; i < count; i++) x[i] = count - 1 - i;
  } else {
    for (let i = 0; i < count; i++) x[i] = i;
  }

  const TWO_PI = 2 * Math.PI;

  switch (pattern) {
    case "stock": {
      // Each data point = 1 minute. Doubles every 10 years.
      // 10 years ≈ 3,652 days × 1,440 min/day = 5,258,880 minutes.
      const MINS_PER_DECADE = 5258880;
      const drift = Math.LN2 / MINS_PER_DECADE; // exact doubling per 10yr
      const driftNeg = -drift * 3;
      const vol = 0.0005; // per-minute volatility
      const volHigh = vol * 1.8;

      // Recessions: ~1 per decade of data, each lasting ~6-18 months of minutes
      const decades = count / MINS_PER_DECADE;
      const recessionCount = Math.max(
        1,
        Math.round(decades * (0.8 + Math.random() * 0.4)),
      );
      const rPairs: { s: number; e: number }[] = [];
      for (let r = 0; r < recessionCount; r++) {
        const start = Math.floor(Math.random() * count * 0.9);
        const durationMins = Math.floor((180 + Math.random() * 360) * 1440); // 6-18 months in minutes
        rPairs.push({ s: start, e: start + durationMins });
      }
      rPairs.sort((a, b) => a.s - b.s);

      let logP = Math.log(10 + Math.random() * 20);
      let rIdx = 0;
      let spare = 0;
      let hasSpare = false;
      for (let i = 0; i < count; i++) {
        while (rIdx < rPairs.length && i >= rPairs[rIdx].e) rIdx++;
        const inRecession =
          rIdx < rPairs.length && i >= rPairs[rIdx].s && i < rPairs[rIdx].e;

        const d = inRecession ? driftNeg : drift;
        const v = inRecession ? volHigh : vol;

        // Box-Muller: use both variates to halve sqrt+log calls
        let z: number;
        if (hasSpare) {
          z = spare;
          hasSpare = false;
        } else {
          const u1 = Math.random() || 1e-10;
          const r = Math.sqrt(-2 * Math.log(u1));
          const theta = TWO_PI * Math.random();
          z = r * Math.cos(theta);
          spare = r * Math.sin(theta);
          hasSpare = true;
        }

        logP += d + v * z;
        y[i] = Math.exp(logP);
      }
      break;
    }
    case "trending": {
      // Random walk on log-price with positive drift — looks like a real
      // stock that's been going up. Per-step volatility is fixed so more
      // points = more visible choppiness naturally.
      let logP = Math.log(20 + Math.random() * 20);
      // Target: price roughly doubles over the full series
      const drift = Math.LN2 / count;
      const vol = 0.015; // per-step volatility — constant regardless of count
      let spare = 0;
      let hasSpare = false;
      for (let i = 0; i < count; i++) {
        let z: number;
        if (hasSpare) {
          z = spare;
          hasSpare = false;
        } else {
          const u1 = Math.random() || 1e-10;
          const r = Math.sqrt(-2 * Math.log(u1));
          const theta = TWO_PI * Math.random();
          z = r * Math.cos(theta);
          spare = r * Math.sin(theta);
          hasSpare = true;
        }
        logP += drift + vol * z;
        y[i] = Math.exp(logP);
      }
      break;
    }
    case "declining": {
      // Random walk on log-price with negative drift — looks like a real
      // stock that's been declining. Same per-step vol as trending.
      let logP = Math.log(60 + Math.random() * 40);
      // Target: price roughly halves over the full series
      const drift = -Math.LN2 / count;
      const vol = 0.015;
      let spare = 0;
      let hasSpare = false;
      for (let i = 0; i < count; i++) {
        let z: number;
        if (hasSpare) {
          z = spare;
          hasSpare = false;
        } else {
          const u1 = Math.random() || 1e-10;
          const r = Math.sqrt(-2 * Math.log(u1));
          const theta = TWO_PI * Math.random();
          z = r * Math.cos(theta);
          spare = r * Math.sin(theta);
          hasSpare = true;
        }
        logP += drift + vol * z;
        y[i] = Math.exp(logP);
      }
      break;
    }
    case "spikey": {
      // Random values in both directions with a few massive 5x spikes
      const avg = 20 + Math.random() * 30;
      const spikeCount = 3 + Math.floor(Math.random() * 5);
      const spikeIndices = new Set<number>();
      while (spikeIndices.size < Math.min(spikeCount, count)) {
        spikeIndices.add(Math.floor(Math.random() * count));
      }
      const avg12 = avg * 1.2;
      const avg5 = avg * 5;
      for (let i = 0; i < count; i++) {
        if (spikeIndices.has(i)) {
          y[i] = Math.random() < 0.5 ? -avg5 : avg5;
        } else {
          y[i] = (Math.random() - 0.5) * avg12;
        }
      }
      break;
    }
    case "cyclic": {
      // Cyclic sinusoidal pattern, phase randomised by current time
      const phase = ((Date.now() % 100000) / 100000) * TWO_PI;
      const amplitude = 30 + Math.random() * 20;
      const baseline = 50 + Math.random() * 20;
      const cycles = 2 + Math.random() * 4;
      const tScale = (TWO_PI * cycles) / count;
      const harmAmp = amplitude * 0.25;
      for (let i = 0; i < count; i++) {
        const t = i * tScale + phase;
        y[i] =
          baseline +
          Math.sin(t) * amplitude +
          Math.sin(t * 2.7 + 1.3) * harmAmp +
          (Math.random() - 0.5) * 8;
      }
      break;
    }
  }

  return { x, y };
}

function formatPrice(value: number): string {
  if (value >= 1000) return "$" + (value / 1000).toFixed(1) + "k";
  return "$" + value.toFixed(2);
}

// Format X axis as dates - value is minutes ago from BASE_DATE
function formatDate(minutesAgo: number): string {
  const ms = BASE_DATE.getTime() - Math.round(minutesAgo) * 60000;
  const date = new Date(ms);

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  return `${month} ${day}, ${year}`;
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return { r: r + m, g: g + m, b: b + m };
}

function randomColor(): { r: number; g: number; b: number } {
  return hslToRgb(
    Math.random() * 360,
    0.65 + Math.random() * 0.2,
    0.5 + Math.random() * 0.1,
  );
}

function formatCount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return n.toString();
}

// Simple numeric formatters for non-stock data
function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatIndex(value: number): string {
  return Math.round(value).toString();
}

function addChart(
  type: ChartType,
  pointCount: number,
  pattern: DataPattern,
  seriesCount: number = 1,
) {
  seriesCount = Math.max(1, Math.min(10000, seriesCount));

  // Generate multiple series
  const series: ChartSeries[] = [];
  for (let i = 0; i < seriesCount; i++) {
    const data = generateData(pointCount, pattern);
    // Bar charts clamp Y >= 0 for stock-like patterns (bars grow up from baseline)
    if (type === "bar" && pattern !== "spikey" && pattern !== "cyclic") {
      for (let j = 0; j < data.y.length; j++) {
        data.y[j] = Math.max(0, data.y[j]);
      }
    }

    series.push({
      label: seriesCount > 1 ? `Series ${i + 1}` : "",
      color: randomColor(),
      x: data.x,
      y: data.y,
    });
  }

  const isStock = pattern === "stock";

  const instance: ChartInstance = {
    id: "",
    type,
    pointCount,
    zoomX: true,
    zoomY: true,
  };

  const card = document.createElement("div");
  card.className = "chart-card";

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

  const pointSizeHtml =
    type === "scatter"
      ? `
      <div class="chart-point-size">
        <input type="range" min="1" max="8" value="3" class="point-size-slider" title="Point size">
        <span class="point-size-label">3px</span>
      </div>`
      : "";

  const seriesCountLabel =
    seriesCount > 1
      ? `<span class="chart-card-series">×${seriesCount}</span>`
      : "";

  card.innerHTML = `
    <div class="chart-card-header">
      <span class="chart-card-title">Chart</span>
      <span class="chart-card-type">${typeLabel}</span>
      <span class="chart-card-points">${formatCount(pointCount)}</span>${seriesCountLabel}${pointSizeHtml}
      <div class="chart-zoom-split">
        <button class="zoom-axis-btn active" data-action="toggle-x" title="Toggle X zoom">X</button>
        <button class="zoom-axis-btn active" data-action="toggle-y" title="Toggle Y zoom">Y</button>
      </div>
      <div class="chart-card-actions">
        <button class="chart-action-btn" data-action="reset" title="Reset view">⌘</button>
        <button class="chart-action-btn danger" data-action="remove" title="Remove">×</button>
      </div>
    </div>
    <div class="chart-card-body"></div>
  `;

  document.getElementById("chart-grid")!.appendChild(card);
  const container = card.querySelector(".chart-card-body") as HTMLElement;

  const config: ChartConfig = {
    type,
    container,
    series,
    formatX: isStock ? formatDate : formatIndex,
    formatY: isStock ? formatPrice : formatNumber,
    zoomMode: "both",
    showTooltip: true,
  };

  let chartId: string;
  try {
    chartId = manager.create(config);
  } catch (e) {
    console.error("Failed to create chart:", e);
    card.remove();
    return;
  }
  instance.id = chartId;
  card.dataset.id = chartId;
  container.id = `chart-container-${chartId}`;

  // Point size slider for scatter charts
  const pointSizeSlider = card.querySelector(
    ".point-size-slider",
  ) as HTMLInputElement | null;
  const pointSizeLabel = card.querySelector(
    ".point-size-label",
  ) as HTMLElement | null;
  if (pointSizeSlider && pointSizeLabel) {
    pointSizeSlider.addEventListener("input", () => {
      const size = parseInt(pointSizeSlider.value);
      pointSizeLabel.textContent = size + "px";
      manager.setPointSize(instance.id, size);
    });
  }

  card.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(
      "[data-action]",
    ) as HTMLElement;
    if (!btn) return;

    const action = btn.dataset.action;
    switch (action) {
      case "reset":
        manager.resetView(instance.id);
        break;
      case "remove":
        removeChart(instance.id);
        break;
      case "toggle-x":
        toggleAxis(instance, "x", btn, card);
        break;
      case "toggle-y":
        toggleAxis(instance, "y", btn, card);
        break;
    }
  });

  chartInstances.push(instance);
}

function removeChart(id: string) {
  manager.destroy(id);

  const idx = chartInstances.findIndex((i) => i.id === id);
  if (idx >= 0) {
    chartInstances.splice(idx, 1);
  }

  const card = document.querySelector(`.chart-card[data-id="${id}"]`);
  if (card) card.remove();
}

function toggleAxis(
  instance: ChartInstance,
  axis: "x" | "y",
  btn: HTMLElement,
  card: Element,
) {
  if (axis === "x") {
    instance.zoomX = !instance.zoomX;
  } else {
    instance.zoomY = !instance.zoomY;
  }

  const xBtn = card.querySelector('[data-action="toggle-x"]') as HTMLElement;
  const yBtn = card.querySelector('[data-action="toggle-y"]') as HTMLElement;
  xBtn.classList.toggle("active", instance.zoomX);
  yBtn.classList.toggle("active", instance.zoomY);

  // Determine zoom mode - both can be off (disables zoom entirely)
  let mode: ZoomMode;
  if (instance.zoomX && instance.zoomY) mode = "both";
  else if (instance.zoomX) mode = "x-only";
  else if (instance.zoomY) mode = "y-only";
  else mode = "none";

  manager.setZoomMode(instance.id, mode);
}

function setupTheme() {
  const btn = document.getElementById("theme-btn")!;
  const sunIcon = document.getElementById("theme-icon-sun")!;
  const moonIcon = document.getElementById("theme-icon-moon")!;

  const updateIcon = () => {
    sunIcon.style.display = isDark ? "none" : "block";
    moonIcon.style.display = isDark ? "block" : "none";
  };

  updateIcon();

  btn.addEventListener("click", () => {
    isDark = !isDark;
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
    manager.setTheme(isDark);
    updateIcon();
  });
}

async function init() {
  manager = ChartManager.getInstance();

  const success = await manager.init();
  if (!success) {
    const toast = document.getElementById("error-toast")!;
    toast.textContent = "WebGPU not available. Please use a supported browser.";
    toast.classList.remove("hidden");
    return;
  }

  manager.onStats((stats) => {
    document.getElementById("active")!.textContent = stats.active.toString();
    document.getElementById("total")!.textContent = stats.total.toString();
  });

  setupTheme();
  setupControls();

  setTimeout(() => {
    addChart("scatter", 500, "stock", 1);
    addChart("line", 300, "trending", 3);
    addChart("bar", 100, "spikey", 1);
    addChart("line", 200, "cyclic", 1);
  }, 100);
}

function setupControls() {
  const typeSelect = document.getElementById("chart-type") as HTMLSelectElement;
  const pointsInput = document.getElementById(
    "point-count",
  ) as HTMLInputElement;
  const patternSelect = document.getElementById("pattern") as HTMLSelectElement;
  const syncToggle = document.getElementById("sync-toggle") as HTMLInputElement;
  const syncLabel = document.getElementById("sync-label")!;
  const seriesInput = document.getElementById(
    "series-count",
  ) as HTMLInputElement;

  document.getElementById("add-chart")!.addEventListener("click", () => {
    const type = typeSelect.value as ChartType;
    const points = parseInt(pointsInput.value) || 500;
    const pattern = patternSelect.value as DataPattern;
    const seriesCount = Math.max(
      1,
      Math.min(10000, parseInt(seriesInput.value) || 3),
    );
    addChart(type, points, pattern, seriesCount);
  });

  document.getElementById("add-batch")!.addEventListener("click", () => {
    const type = typeSelect.value as ChartType;
    const points = parseInt(pointsInput.value) || 500;
    const pattern = patternSelect.value as DataPattern;
    const seriesCount = Math.max(
      1,
      Math.min(10000, parseInt(seriesInput.value) || 3),
    );

    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        addChart(type, points, pattern, seriesCount);
      }, i * 100);
    }
  });

  document.getElementById("clear-all")!.addEventListener("click", () => {
    for (const instance of [...chartInstances]) {
      removeChart(instance.id);
    }
  });

  syncToggle.addEventListener("change", () => {
    const synced = syncToggle.checked;
    manager.setSyncViews(synced);
    syncLabel.textContent = synced ? "Synced" : "Sync Off";
  });
}

// Hot reload support (only in development)
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  const ws = new WebSocket(`ws://${location.host}/__hot`);
  ws.onmessage = (e) => {
    if (e.data === "reload") location.reload();
  };
}

init();
