// chartai Landing Page

import { ChartManager as manager } from "../src/chart-library.ts";
import type { Chart } from "../src/chart-library.ts";
import type { ChartSeries } from "../src/types.ts";
import { labelsPlugin } from "../src/plugins/labels.ts";
import { zoomPlugin } from "../src/plugins/zoom.ts";
import { hoverPlugin } from "../src/plugins/hover.ts";
import { legendPlugin } from "../src/plugins/legend.ts";
import { LineChart } from "../src/charts/line.ts";
import { AreaChart } from "../src/charts/area.ts";
import { ScatterChart } from "../src/charts/scatter.ts";
import { BarChart } from "../src/charts/bar.ts";
import { CandlestickChart } from "../src/charts/candlestick.ts";
import { StepChart } from "../src/charts/experimental/step.ts";
import { HistogramChart } from "../src/charts/experimental/histogram.ts";
import { HeatmapChart } from "../src/charts/experimental/heatmap.ts";
import { BubbleChart } from "../src/charts/experimental/bubble.ts";
import { BaselineAreaChart } from "../src/charts/experimental/baseline-area.ts";
import { ErrorBandChart } from "../src/charts/experimental/error-band.ts";
import { OhlcChart } from "../src/charts/experimental/ohlc.ts";
import { WaterfallChart, prepareWaterfall } from "../src/charts/experimental/waterfall.ts";
import { annotationsPlugin } from "../src/plugins/experimental/annotations.ts";
import type { Annotation, AnnotationType } from "../src/plugins/experimental/annotations.ts";
import { watermarkPlugin } from "../src/plugins/experimental/watermark.ts";
import { crosshairPlugin } from "../src/plugins/experimental/crosshair.ts";
import { thresholdPlugin } from "../src/plugins/experimental/threshold.ts";
import { statsPlugin } from "../src/plugins/experimental/stats.ts";
import { rulerPlugin } from "../src/plugins/experimental/ruler.ts";
import { rangeSelectorPlugin } from "../src/plugins/experimental/range-selector.ts";
import { tooltipPinPlugin } from "../src/plugins/experimental/tooltip-pin.ts";
import { minimapPlugin } from "../src/plugins/experimental/minimap.ts";

type DataPattern = "stock" | "trending" | "declining" | "spikey" | "cyclic";

// manager is the imported singleton
let isDark = document.documentElement.classList.contains("dark");

let liveUpdateSpeed = 1;
let liveUpdateInterval: number | null = null;
let liveAccumulate = false;
let liveLine: Chart;
let liveScatter: Chart;
let liveLine2: Chart;
let liveDataX: number[] = [];
let liveDataY1: number[] = [];
let liveDataY2: number[] = [];
let liveDataY3: number[] = [];

let bigdataLine: Chart | null = null;
let bigdataScatter: Chart | null = null;
let bigseriesLine: Chart | null = null;

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

// Base date for stock data - each data point is one day before
const BASE_DATE = new Date("2026-02-03");

function formatPrice(value: number): string {
  if (value >= 1000) return "$" + (value / 1000).toFixed(1) + "k";
  if (value >= 100) return "$" + value.toFixed(0);
  if (value >= 10) return "$" + value.toFixed(1);
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

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatIndex(value: number): string {
  return Math.round(value).toString();
}

function generateData(
  count: number,
  pattern: DataPattern,
): { x: number[]; y: number[] } {
  const x = new Array<number>(count);
  const y = new Array<number>(count);

  // Stock pattern uses date-based X axis (minutes ago)
  const isDateAxis = pattern === "stock";
  if (isDateAxis) {
    for (let i = 0; i < count; i++) x[i] = count - 1 - i;
  } else {
    for (let i = 0; i < count; i++) x[i] = i;
  }

  const TWO_PI = 2 * Math.PI;

  switch (pattern) {
    case "stock": {
      const MINS_PER_DECADE = 5258880;
      const drift = Math.LN2 / MINS_PER_DECADE;
      const driftNeg = -drift * 3;
      const vol = 0.0005;
      const volHigh = vol * 1.8;

      const decades = count / MINS_PER_DECADE;
      const recessionCount = Math.max(
        1,
        Math.round(decades * (0.8 + Math.random() * 0.4)),
      );
      const rPairs: { s: number; e: number }[] = [];
      for (let r = 0; r < recessionCount; r++) {
        const start = Math.floor(Math.random() * count * 0.9);
        const durationMins = Math.floor((180 + Math.random() * 360) * 1440);
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
      let logP = Math.log(20 + Math.random() * 20);
      const drift = Math.LN2 / count;
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
    case "declining": {
      let logP = Math.log(60 + Math.random() * 40);
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

function generateOHLC(count: number): {
  x: number[];
  y: number[];
  open: number[];
  high: number[];
  low: number[];
} {
  const x = new Array<number>(count);
  const y = new Array<number>(count);
  const open = new Array<number>(count);
  const high = new Array<number>(count);
  const low = new Array<number>(count);

  let price = 50 + Math.random() * 100;
  const drift = Math.LN2 / count;
  const vol = 0.015;
  let spare = 0;
  let hasSpare = false;
  const TWO_PI = 2 * Math.PI;

  for (let i = 0; i < count; i++) {
    x[i] = i;
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
    const o = price;
    const c = Math.max(0.01, price * Math.exp(drift + vol * z));
    const range = Math.abs(c - o) * (1 + Math.random() * 1.5);
    const h = Math.max(o, c) + Math.random() * range * 0.5;
    const l = Math.max(0.01, Math.min(o, c) - Math.random() * range * 0.5);
    open[i] = o;
    high[i] = h;
    low[i] = l;
    y[i] = c;
    price = c;
  }
  return { x, y, open, high, low };
}

async function init() {
  manager.use(LineChart);
  manager.use(AreaChart);
  manager.use(ScatterChart);
  manager.use(BarChart);
  manager.use(CandlestickChart);
  manager.use(StepChart);
  manager.use(HistogramChart);
  manager.use(HeatmapChart);
  manager.use(BubbleChart);
  manager.use(BaselineAreaChart);
  manager.use(ErrorBandChart);
  manager.use(OhlcChart);
  manager.use(WaterfallChart);
  manager.use(labelsPlugin);
  manager.use(zoomPlugin());
  manager.use(hoverPlugin);
  manager.use(legendPlugin);
  manager.use(annotationsPlugin);
  manager.use(watermarkPlugin);
  manager.use(thresholdPlugin);

  setupTheme();

  const success = await manager.init();
  if (!success) {
    alert("WebGPU not available. Please use a supported browser.");
    return;
  }

  createBasicCharts();
  createCandlestickChart();
  createSeriesCharts();
  createSpikesChart();
  createLiveCharts();
  setupBigDataControls();
  setupBigSeriesControls();
  createLegendDemoCharts();
  createLabelsDemoCharts();
  createZoomDemoCharts();
  createHoverDemoCharts();
  createNewChartDemos();
  createNewPluginDemos();
}

function createBasicCharts() {
  // Bar chart - 25 points with trending pattern
  const barData = generateData(25, "trending");
  manager.create({
    type: "bar",
    container: document.getElementById("basic-bar")!,
    series: [
      {
        label: "Revenue",
        color: { r: 0.6, g: 0.4, b: 0.9 },
        x: barData.x,
        y: barData.y,
      },
    ],
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });

  // Line chart - 1000 points with trending pattern
  const lineData = generateData(1000, "trending");
  // Convert X to date-based format (minutes ago)
  const lineDateX = lineData.x.map((_, i) => 1000 - 1 - i);
  const chart = manager.create({
    type: "line",
    container: document.getElementById("basic-line")!,
    series: [
      {
        label: "Stock Price",
        color: { r: 0.3, g: 0.6, b: 1 },
        x: lineDateX,
        y: lineData.y,
      },
    ],
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
  });

  // Scatter chart - 5000 points with cyclic pattern
  const scatterData = generateData(5000, "cyclic");
  manager.create({
    type: "scatter",
    container: document.getElementById("basic-scatter")!,
    series: [
      {
        label: "Cyclic Data",
        color: { r: 1, g: 0.4, b: 0.4 },
        x: scatterData.x,
        y: scatterData.y,
      },
    ],
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
  });

  // Area chart - filled line down to baseline
  const areaData = generateData(1000, "trending");
  manager.create({
    type: "area",
    container: document.getElementById("basic-area")!,
    series: [
      {
        label: "Filled Area",
        color: { r: 0.2, g: 0.7, b: 0.5 },
        x: areaData.x,
        y: areaData.y,
      },
    ],
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });
}

function createCandlestickChart() {
  const data = generateOHLC(500);
  manager.create({
    type: "candlestick",
    container: document.getElementById("basic-candlestick")!,
    series: [
      {
        label: "",
        color: { r: 0.3, g: 0.6, b: 1 },
        x: data.x,
        y: data.y,
        open: data.open,
        high: data.high,
        low: data.low,
      },
    ],
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });
}

function createSeriesCharts() {
  // Bar chart - 25 points × 3 series (same pattern, varying heights)
  const barSeries: ChartSeries[] = [];
  const heightMultipliers = [1.0, 0.7, 1.3];

  for (let i = 0; i < 3; i++) {
    const data = generateData(25, "trending");
    const adjustedY = data.y.map((val) => val * heightMultipliers[i]);
    barSeries.push({
      label: `Series ${i + 1}`,
      color: randomColor(),
      x: data.x,
      y: adjustedY,
    });
  }
  manager.create({
    type: "bar",
    container: document.getElementById("series-bar")!,
    series: barSeries,
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });

  // Line chart - 1000 points × 3 series (trending patterns)
  const lineSeries: ChartSeries[] = [];
  for (let i = 0; i < 3; i++) {
    const data = generateData(1000, "trending");
    // Convert X to date-based format (minutes ago)
    const lineDateX = data.x.map((_, idx) => 1000 - 1 - idx);
    lineSeries.push({
      label: `Series ${i + 1}`,
      color: randomColor(),
      x: lineDateX,
      y: data.y,
    });
  }
  manager.create({
    type: "line",
    container: document.getElementById("series-line")!,
    series: lineSeries,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
  });

  // Scatter chart - 5000 points × 3 series (cyclic)
  const scatterSeries: ChartSeries[] = [];
  for (let i = 0; i < 3; i++) {
    const data = generateData(5000, "cyclic");
    scatterSeries.push({
      label: `Series ${i + 1}`,
      color: randomColor(),
      x: data.x,
      y: data.y,
    });
  }
  manager.create({
    type: "scatter",
    container: document.getElementById("series-scatter")!,
    series: scatterSeries,
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
  });

  // Area chart - 3 series with filled areas
  const areaSeries: ChartSeries[] = [];
  for (let i = 0; i < 3; i++) {
    const data = generateData(1000, "trending");
    areaSeries.push({
      label: `Series ${i + 1}`,
      color: randomColor(),
      x: data.x,
      y: data.y,
    });
  }
  manager.create({
    type: "area",
    container: document.getElementById("series-area")!,
    series: areaSeries,
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });
}

function createSpikesChart() {
  const spikyData = generateData(100000, "spikey");
  manager.create({
    type: "line",
    container: document.getElementById("spikes-line")!,
    series: [
      {
        label: "Volatile Data",
        color: { r: 1, g: 0.5, b: 0.2 },
        x: spikyData.x,
        y: spikyData.y,
      },
    ],
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
  });
}

function createLiveCharts() {
  // Initialize with 100 data points using trending pattern
  const initialData1 = generateData(100, "trending");
  const initialData2 = generateData(100, "trending");
  const initialData3 = generateData(100, "trending");

  liveDataX = Array.from({ length: 100 }, (_, i) => i);
  liveDataY1 = [...initialData1.y];
  liveDataY2 = [...initialData2.y];
  liveDataY3 = [...initialData3.y];

  liveLine = manager.create({
    type: "line",
    container: document.getElementById("live-line")!,
    series: [
      {
        label: "Live Data",
        color: { r: 0.2, g: 0.8, b: 0.4 },
        x: [...liveDataX],
        y: [...liveDataY1],
      },
    ],
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });

  liveScatter = manager.create({
    type: "scatter",
    container: document.getElementById("live-scatter")!,
    series: [
      {
        label: "Live Data",
        color: { r: 0.9, g: 0.3, b: 0.7 },
        x: [...liveDataX],
        y: [...liveDataY2],
      },
    ],
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });

  liveLine2 = manager.create({
    type: "line",
    container: document.getElementById("live-line2")!,
    series: [
      {
        label: "Live Data",
        color: { r: 0.4, g: 0.5, b: 1 },
        x: [...liveDataX],
        y: [...liveDataY3],
      },
    ],
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
  });

  // Setup speed controls
  const speedButtons = document.querySelectorAll(".speed-btn");
  speedButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      speedButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      liveUpdateSpeed = parseInt((btn as HTMLElement).dataset.speed!);
      startLiveUpdate();
    });
  });

  // Setup accumulate toggle
  const accumulateToggle = document.getElementById(
    "accumulate-toggle",
  ) as HTMLInputElement;
  accumulateToggle.addEventListener("change", () => {
    liveAccumulate = accumulateToggle.checked;
  });

  // Start updates
  startLiveUpdate();
}

function startLiveUpdate() {
  if (liveUpdateInterval !== null) {
    clearInterval(liveUpdateInterval);
  }

  const intervalMs = 1000 / liveUpdateSpeed;
  liveUpdateInterval = window.setInterval(() => {
    const nextX =
      liveDataX.length > 0 ? liveDataX[liveDataX.length - 1] + 1 : 0;
    const lastY1 =
      liveDataY1.length > 0 ? liveDataY1[liveDataY1.length - 1] : 50;
    const lastY2 =
      liveDataY2.length > 0 ? liveDataY2[liveDataY2.length - 1] : 50;
    const lastY3 =
      liveDataY3.length > 0 ? liveDataY3[liveDataY3.length - 1] : 50;

    // Generate new points with random walk
    liveDataX.push(nextX);
    liveDataY1.push(lastY1 + (Math.random() - 0.5) * 5);
    liveDataY2.push(lastY2 + (Math.random() - 0.5) * 8);
    liveDataY3.push(lastY3 + (Math.random() - 0.5) * 6);

    // Ring buffer mode: keep last 500 points for performance
    if (!liveAccumulate && liveDataX.length > 500) {
      liveDataX.shift();
      liveDataY1.shift();
      liveDataY2.shift();
      liveDataY3.shift();
    }

    liveLine.setData([
      {
        label: "Live Data",
        color: { r: 0.2, g: 0.8, b: 0.4 },
        x: [...liveDataX],
        y: [...liveDataY1],
      },
    ]);
    liveScatter.setData([
      {
        label: "Live Data",
        color: { r: 0.9, g: 0.3, b: 0.7 },
        x: [...liveDataX],
        y: [...liveDataY2],
      },
    ]);
    liveLine2.setData([
      {
        label: "Live Data",
        color: { r: 0.4, g: 0.5, b: 1 },
        x: [...liveDataX],
        y: [...liveDataY3],
      },
    ]);

    // Update stats
    const mode = liveAccumulate ? "Accumulate" : "Ring Buffer";
    document.getElementById("live-stats")!.textContent =
      `Points: ${liveDataX.length} (${mode})`;
  }, intervalMs);
}

function setupBigDataControls() {
  const generateBtn = document.getElementById("bigdata-generate")!;
  const countInput = document.getElementById(
    "bigdata-count",
  ) as HTMLInputElement;
  const statsDiv = document.getElementById("bigdata-stats")!;

  generateBtn.addEventListener("click", () => {
    const count = parseInt(countInput.value) || 1000000;
    generateBtn.setAttribute("disabled", "true");
    statsDiv.textContent = "Generating...";

    setTimeout(() => {
      const t0 = performance.now();

      bigdataLine?.destroy();
      bigdataScatter?.destroy();

      // Generate data with stock pattern for line
      const lineData = generateData(count, "stock");
      // Generate cyclic pattern for scatter
      const scatterData = generateData(count, "cyclic");

      bigdataLine = manager.create({
        type: "line",
        container: document.getElementById("bigdata-line")!,
        series: [
          {
            label: "Big Data",
            color: { r: 0.3, g: 0.7, b: 0.9 },
            x: lineData.x,
            y: lineData.y,
          },
        ],
        formatX: formatDate,
        formatY: formatPrice,
        showTooltip: true,
      });

      bigdataScatter = manager.create({
        type: "scatter",
        container: document.getElementById("bigdata-scatter")!,
        series: [
          {
            label: "Big Data",
            color: { r: 0.9, g: 0.5, b: 0.3 },
            x: scatterData.x,
            y: scatterData.y,
          },
        ],
        formatX: formatIndex,
        formatY: formatNumber,
        showTooltip: true,
      });

      const elapsed = performance.now() - t0;
      const countFormatted = (count / 1e6).toFixed(1) + "M";

      document.getElementById("bigdata-line-info")!.textContent =
        countFormatted;
      document.getElementById("bigdata-scatter-info")!.textContent =
        countFormatted;
      statsDiv.textContent = `Generated in ${elapsed.toFixed(0)}ms`;
      generateBtn.removeAttribute("disabled");
    }, 50);
  });
}

function setupBigSeriesControls() {
  const generateBtn = document.getElementById("bigseries-generate")!;
  const seriesInput = document.getElementById(
    "bigseries-series",
  ) as HTMLInputElement;
  const pointsInput = document.getElementById(
    "bigseries-points",
  ) as HTMLInputElement;
  const statsDiv = document.getElementById("bigseries-stats")!;

  generateBtn.addEventListener("click", () => {
    const seriesCount = parseInt(seriesInput.value) || 1000;
    const pointsPerSeries = parseInt(pointsInput.value) || 1000;

    generateBtn.setAttribute("disabled", "true");
    statsDiv.textContent = "Generating...";

    setTimeout(() => {
      const t0 = performance.now();

      bigseriesLine?.destroy();

      // Generate series with trending patterns
      const series: ChartSeries[] = [];
      for (let i = 0; i < seriesCount; i++) {
        const data = generateData(pointsPerSeries, "trending");
        // Convert X to date-based format (minutes ago)
        const lineDateX = data.x.map((_, idx) => pointsPerSeries - 1 - idx);
        series.push({
          label: `S${i + 1}`,
          color: randomColor(),
          x: lineDateX,
          y: data.y,
        });
      }

      bigseriesLine = manager.create({
        type: "line",
        container: document.getElementById("bigseries-line")!,
        series,
        formatX: formatDate,
        formatY: formatPrice,
        showTooltip: true,
      });

      const elapsed = performance.now() - t0;
      const totalPoints = seriesCount * pointsPerSeries;
      const formatted =
        totalPoints >= 1e6
          ? (totalPoints / 1e6).toFixed(1) + "M"
          : (totalPoints / 1e3).toFixed(0) + "k";

      document.getElementById("bigseries-info")!.textContent =
        `${seriesCount} series × ${pointsPerSeries} pts = ${formatted} total`;
      statsDiv.textContent = `Generated in ${elapsed.toFixed(0)}ms`;
      generateBtn.removeAttribute("disabled");
    }, 50);
  });
}

function createLegendDemoCharts() {
  const lineData3 = generateData(500, "trending");
  const lineDateX = lineData3.x.map((_, i) => 500 - 1 - i);
  const series3: ChartSeries[] = [];
  for (let i = 0; i < 3; i++) {
    const data = generateData(500, "trending");
    series3.push({
      label: `Series ${i + 1}`,
      color: randomColor(),
      x: lineDateX,
      y: data.y,
    });
  }

  manager.create({
    type: "line",
    container: document.getElementById("legend-default")!,
    series: series3,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    legend: {},
  });

  manager.create({
    type: "line",
    container: document.getElementById("legend-default-open")!,
    series: series3,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    legend: { defaultOpen: true },
  });

  manager.create({
    type: "line",
    container: document.getElementById("legend-always-open")!,
    series: series3,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    legend: { alwaysOpen: true },
  });

  const series12: ChartSeries[] = [];
  for (let i = 0; i < 12; i++) {
    const data = generateData(300, "trending");
    const lineDateX12 = data.x.map((_, idx) => 300 - 1 - idx);
    series12.push({
      label: `Series ${i + 1}`,
      color: randomColor(),
      x: lineDateX12,
      y: data.y,
    });
  }

  manager.create({
    type: "line",
    container: document.getElementById("legend-many-series")!,
    series: series12,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    legend: { defaultOpen: true },
  });
}

function createLabelsDemoCharts() {
  const data = generateData(200, "trending");
  const lineDateX = data.x.map((_, i) => 200 - 1 - i);
  const series = [
    { label: "S1", color: randomColor(), x: lineDateX, y: data.y },
  ];

  manager.create({
    type: "line",
    container: document.getElementById("labels-default")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
  });

  manager.create({
    type: "line",
    container: document.getElementById("labels-small")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    labelSize: 10,
  });

  manager.create({
    type: "line",
    container: document.getElementById("labels-grid")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    gridColor: "rgba(100, 150, 255, 0.3)",
  });
}

function createZoomDemoCharts() {
  const data = generateData(300, "trending");
  const lineDateX = data.x.map((_, i) => 300 - 1 - i);
  const series = [
    { label: "S1", color: randomColor(), x: lineDateX, y: data.y },
  ];
  const base = { type: "line" as const, series, formatX: formatDate, formatY: formatPrice, showTooltip: true };

  manager.create({
    ...base,
    container: document.getElementById("zoom-both")!,
    zoomMode: "both",
  });
  manager.create({
    ...base,
    container: document.getElementById("zoom-x")!,
    zoomMode: "x-only",
  });
  manager.create({
    ...base,
    container: document.getElementById("zoom-y")!,
    zoomMode: "y-only",
  });
  manager.create({
    ...base,
    container: document.getElementById("zoom-none")!,
    zoomMode: "none",
  });
}

function createHoverDemoCharts() {
  const data = generateData(200, "trending");
  const lineDateX = data.x.map((_, i) => 200 - 1 - i);
  const series = [
    { label: "S1", color: randomColor(), x: lineDateX, y: data.y },
  ];

  manager.create({
    type: "line",
    container: document.getElementById("hover-tooltip")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
  });

  manager.create({
    type: "line",
    container: document.getElementById("hover-no-tooltip")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: false,
  });
}

// ─── Helpers for new chart demos ────────────────────────────────────────────

function boxMuller(mean = 0, std = 1): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s * std + mean; }
    let u: number, v: number, s: number;
    do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const f = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * f;
    return u * f * std + mean;
  };
}

function rollingStats(y: number[], window: number): { lo: number[]; hi: number[] } {
  const lo = new Array<number>(y.length);
  const hi = new Array<number>(y.length);
  for (let i = 0; i < y.length; i++) {
    const start = Math.max(0, i - window);
    const slice = y.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    lo[i] = mean - 2 * std;
    hi[i] = mean + 2 * std;
  }
  return { lo, hi };
}

// ─── New Chart Demos ─────────────────────────────────────────────────────────

function createNewChartDemos() {
  createStepDemos();
  createHistogramDemos();
  createHeatmapDemos();
  createBubbleDemos();
  createBaselineAreaDemos();
  createErrorBandDemos();
  createOhlcDemos();
  createWaterfallDemos();
}

function createStepDemos() {
  const stepData = generateData(40, "cyclic");
  const base = {
    type: "step" as const,
    series: [{ label: "Signal", color: { r: 0.3, g: 0.6, b: 1 }, x: stepData.x, y: stepData.y }],
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
  };
  manager.create({ ...base, container: document.getElementById("chart-step-after")!, stepMode: "after" });
  manager.create({ ...base, container: document.getElementById("chart-step-before")!, stepMode: "before" });
  manager.create({ ...base, container: document.getElementById("chart-step-center")!, stepMode: "center" });
}

function createHistogramDemos() {
  const rng = boxMuller(50, 12);
  const normalX = Array.from({ length: 10000 }, rng);
  manager.create({
    type: "histogram",
    container: document.getElementById("chart-histogram-normal")!,
    series: [{ label: "Height (cm)", color: { r: 0.4, g: 0.6, b: 1 }, x: normalX, y: normalX.map(() => 0) }],
    formatX: formatNumber,
    formatY: (v) => Math.round(v).toString(),
    showTooltip: true,
  });

  const rngA = boxMuller(40, 8), rngB = boxMuller(70, 6), rngC = boxMuller(55, 14);
  const nA = Array.from({ length: 4000 }, rngA);
  const nB = Array.from({ length: 4000 }, rngB);
  const nC = Array.from({ length: 4000 }, rngC);
  manager.create({
    type: "histogram",
    container: document.getElementById("chart-histogram-multi")!,
    series: [
      { label: "Group A", color: { r: 0.35, g: 0.6, b: 1 }, x: nA, y: nA.map(() => 0) },
      { label: "Group B", color: { r: 1, g: 0.45, b: 0.35 }, x: nB, y: nB.map(() => 0) },
      { label: "Group C", color: { r: 0.3, g: 0.78, b: 0.5 }, x: nC, y: nC.map(() => 0) },
    ],
    formatX: formatNumber,
    formatY: (v) => Math.round(v).toString(),
    showTooltip: true,
  });

  const rngLog = boxMuller(0, 0.6);
  const logNormal = Array.from({ length: 8000 }, () => Math.exp(rngLog()));
  manager.create({
    type: "histogram",
    container: document.getElementById("chart-histogram-skewed")!,
    series: [{ label: "Log-normal", color: { r: 0.8, g: 0.45, b: 0.9 }, x: logNormal, y: logNormal.map(() => 0) }],
    formatX: (v) => v.toFixed(1),
    formatY: (v) => Math.round(v).toString(),
    showTooltip: true,
  });
}

function createHeatmapDemos() {
  const cols = 12, rows = 12;
  const xs: number[] = [], ys: number[] = [], vs: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      xs.push(c); ys.push(r);
      vs.push(0.5 + 0.5 * Math.sin(c / cols * Math.PI * 2) * Math.cos(r / rows * Math.PI * 2));
    }
  }
  const series = [{ label: "Value", color: { r: 1, g: 1, b: 1 }, x: xs, y: ys, value: vs }];
  const base = { type: "heatmap" as const, series, gridColumns: cols, gridRows: rows, formatX: formatIndex, formatY: formatIndex };
  manager.create({ ...base, container: document.getElementById("chart-heatmap-viridis")!, colorScale: 0 });
  manager.create({ ...base, container: document.getElementById("chart-heatmap-plasma")!, colorScale: 1 });
  manager.create({ ...base, container: document.getElementById("chart-heatmap-warm")!, colorScale: 3 });
  manager.create({ ...base, container: document.getElementById("chart-heatmap-cool")!, colorScale: 2 });
}

function createBubbleDemos() {
  const n = 300;
  const bx = Array.from({ length: n }, () => Math.random() * 100);
  const by = Array.from({ length: n }, () => Math.random() * 100);
  const br = Array.from({ length: n }, () => 1 + Math.random() * 9);
  manager.create({
    type: "bubble",
    container: document.getElementById("chart-bubble")!,
    series: [{ label: "Data", color: { r: 0.3, g: 0.6, b: 1 }, x: bx, y: by, r: br }],
    formatX: formatNumber,
    formatY: formatNumber,
    showTooltip: true,
    maxPointSize: 36,
  });

  const clusterDefs = [
    { cx: 25, cy: 70, color: { r: 1, g: 0.4, b: 0.4 } },
    { cx: 55, cy: 40, color: { r: 0.3, g: 0.8, b: 0.4 } },
    { cx: 80, cy: 75, color: { r: 0.5, g: 0.4, b: 1 } },
  ];
  const rngG = boxMuller(0, 10);
  const multiSeries = clusterDefs.map(({ cx, cy, color }, i) => {
    const count = 80 + i * 20;
    return {
      label: `Cluster ${i + 1}`,
      color,
      x: Array.from({ length: count }, () => cx + rngG()),
      y: Array.from({ length: count }, () => cy + rngG()),
      r: Array.from({ length: count }, () => 1 + Math.random() * 7),
    };
  });
  manager.create({
    type: "bubble",
    container: document.getElementById("chart-bubble-multi")!,
    series: multiSeries,
    formatX: formatNumber,
    formatY: formatNumber,
    showTooltip: true,
    maxPointSize: 28,
    legend: { alwaysOpen: true },
  });
}

function createBaselineAreaDemos() {
  const n = 400;
  const x = Array.from({ length: n }, (_, i) => i);
  const rng = boxMuller(0, 1);
  let v = 0;
  const y = x.map(() => { v += rng() * 2; return v; });
  manager.create({
    type: "baseline-area",
    container: document.getElementById("chart-baseline-pnl")!,
    series: [{ label: "P&L", color: { r: 0.3, g: 0.7, b: 0.4 }, x, y }],
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
    baseline: 0,
  });

  const tempX = Array.from({ length: 365 }, (_, i) => i);
  const tempY = tempX.map((i) => 12 * Math.sin((i / 365) * Math.PI * 2 - 1.5) + (Math.random() - 0.5) * 4);
  manager.create({
    type: "baseline-area",
    container: document.getElementById("chart-baseline-temp")!,
    series: [{ label: "Temp deviation", color: { r: 1, g: 0.5, b: 0.2 }, x: tempX, y: tempY }],
    formatX: (val) => `Day ${Math.round(val)}`,
    formatY: (val) => `${val.toFixed(1)}°`,
    showTooltip: true,
    baseline: 0,
    positiveColor: [0.9, 0.3, 0.2] as [number, number, number],
    negativeColor: [0.2, 0.5, 0.9] as [number, number, number],
  });
}

function createErrorBandDemos() {
  const n = 300;
  const x = Array.from({ length: n }, (_, i) => i);
  const rng = boxMuller(0, 1);
  let ctr = 50;
  const y = x.map(() => { ctr += rng() * 1.5; return ctr; });
  const lo = y.map((val, i) => val - (2 + i * 0.08));
  const hi = y.map((val, i) => val + (2 + i * 0.08));
  manager.create({
    type: "error-band",
    container: document.getElementById("chart-error-band")!,
    series: [{ label: "Forecast", color: { r: 0.4, g: 0.65, b: 1 }, x, y, lo, hi }],
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
    bandOpacity: 0.25,
  });

  const stockData = generateData(300, "trending");
  const { lo: blo, hi: bhi } = rollingStats(stockData.y, 20);
  manager.create({
    type: "error-band",
    container: document.getElementById("chart-error-bollinger")!,
    series: [{ label: "Price", color: { r: 0.9, g: 0.55, b: 0.2 }, x: stockData.x, y: stockData.y, lo: blo, hi: bhi }],
    formatX: formatIndex,
    formatY: formatPrice,
    showTooltip: true,
    bandOpacity: 0.2,
  });
}

function createOhlcDemos() {
  const ohlcData = generateOHLC(500);
  const series = [{
    label: "OHLC",
    color: { r: 0.3, g: 0.6, b: 1 },
    x: ohlcData.x, y: ohlcData.y,
    open: ohlcData.open, high: ohlcData.high, low: ohlcData.low,
  }];
  manager.create({ type: "ohlc", container: document.getElementById("chart-ohlc")!, series, formatX: formatIndex, formatY: formatPrice, showTooltip: true });
  manager.create({ type: "candlestick", container: document.getElementById("chart-ohlc-candle-compare")!, series, formatX: formatIndex, formatY: formatPrice, showTooltip: true });
}

function createWaterfallDemos() {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const deltas = [120, -45, 75, -30, 90, -60];
  const positions = deltas.map((_, i) => i);
  const prep = prepareWaterfall(positions, deltas);

  manager.create({
    type: "waterfall",
    container: document.getElementById("chart-waterfall")!,
    series: [{ label: "Quarterly P&L", color: { r: 0.3, g: 0.6, b: 1 }, x: prep.x, y: prep.y, h: prep.h, t: prep.t, bw: prep.bw }],
    formatX: (val) => labels[Math.round(val)] ?? "",
    formatY: formatNumber,
    showTooltip: true,
  });

  const bridgeLabels = ["Revenue", "Other Inc.", "Gross", "COGS", "OpEx", "Tax", "Net"];
  const bridgeDeltas = [80, 40, 0, -25, -18, -12, 0];
  const bridgeTotals = [0, 0, 1, 0, 0, 0, 1];
  const bridgePositions = bridgeDeltas.map((_, i) => i);
  const prep2 = prepareWaterfall(bridgePositions, bridgeDeltas, bridgeTotals);

  manager.create({
    type: "waterfall",
    container: document.getElementById("chart-waterfall-totals")!,
    series: [{ label: "P&L Bridge", color: { r: 0.3, g: 0.6, b: 1 }, x: prep2.x, y: prep2.y, h: prep2.h, t: prep2.t, bw: prep2.bw }],
    formatX: (val) => bridgeLabels[Math.round(val)] ?? "",
    formatY: formatNumber,
    showTooltip: true,
    totalColor: [0.5, 0.5, 0.65] as [number, number, number],
  });
}

// ─── New Plugin Demos ─────────────────────────────────────────────────────────

function createNewPluginDemos() {
  createAnnotationsDemos();
  createThresholdDemos();
  createCrosshairDemos();
  createWatermarkDemos();
  createStatsDemos();
  createRulerDemos();
  createTooltipPinDemos();
  createMinimapDemos();
  createRangeSelectorDemo();
}

function createAnnotationsDemos() {
  const data = generateData(200, "trending");
  const x = data.x.map((_, i) => 200 - 1 - i);
  const yMid = data.y.reduce((a, b) => a + b, 0) / data.y.length;
  const series = [{ label: "Price", color: { r: 0.35, g: 0.6, b: 1 }, x, y: data.y }];

  manager.create({
    type: "line",
    container: document.getElementById("plugin-annotations-lines")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    annotations: [
      { type: "hline", value: yMid * 1.2, label: "Resistance", color: "rgba(255,80,80,0.9)", dash: [5, 3] as [number, number] },
      { type: "hline", value: yMid * 0.85, label: "Support", color: "rgba(80,200,120,0.9)", dash: [5, 3] as [number, number] },
      { type: "vline", value: x[Math.floor(x.length * 0.4)], label: "Event", color: "rgba(200,160,60,0.85)" },
    ],
  });

  manager.create({
    type: "line",
    container: document.getElementById("plugin-annotations-regions")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    annotations: [
      { type: "hregion", value: yMid * 0.9, value2: yMid * 1.1, label: "Target zone", color: "rgba(80,200,120,0.1)" },
      { type: "vregion", value: x[Math.floor(x.length * 0.55)], value2: x[Math.floor(x.length * 0.75)], label: "Lockup", color: "rgba(200,160,60,0.12)" },
    ],
  });

  manager.create({
    type: "line",
    container: document.getElementById("plugin-annotations-combined")!,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    annotations: [
      { type: "hregion", value: yMid * 0.88, value2: yMid * 0.95, color: "rgba(255,80,80,0.08)" },
      { type: "hregion", value: yMid * 1.05, value2: yMid * 1.15, color: "rgba(80,200,120,0.08)" },
      { type: "hline", value: yMid * 1.15, label: "Take profit", color: "rgba(80,200,120,0.85)", lineWidth: 1.5 },
      { type: "hline", value: yMid * 0.88, label: "Stop loss", color: "rgba(255,80,80,0.85)", lineWidth: 1.5 },
      { type: "vline", value: x[Math.floor(x.length * 0.3)], label: "Earnings", color: "rgba(160,120,240,0.8)", dash: [4, 3] as [number, number] },
    ],
  });

  const interactiveContainer = document.getElementById("plugin-annotations-interactive")!;
  const interactiveChart = manager.create({
    type: "line",
    container: interactiveContainer,
    series,
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    annotations: [],
  });

  let interactiveAnnotations: Annotation[] = [];

  const panel = document.createElement("div");
  panel.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px 8px;font-size:13px;background:rgba(128,128,128,0.06);border-radius:8px;border:1px solid rgba(128,128,128,0.15);margin-top:4px;";

  const typeSelect = document.createElement("select");
  typeSelect.innerHTML = `<option value="hline">H Line</option><option value="vline">V Line</option><option value="hregion">H Region</option><option value="vregion">V Region</option>`;
  typeSelect.style.cssText = "padding:5px 8px;border-radius:6px;border:1px solid rgba(128,128,128,0.3);background:rgba(128,128,128,0.08);font-size:12px;cursor:pointer;color:inherit;min-width:90px;";

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.placeholder = "Value";
  valueInput.style.cssText = "width:90px;padding:5px 8px;border-radius:6px;border:1px solid rgba(128,128,128,0.3);background:rgba(128,128,128,0.08);font-size:12px;color:inherit;outline:none;";

  const value2Wrap = document.createElement("span");
  value2Wrap.style.cssText = "display:none;align-items:center;gap:4px;";
  const value2Label = document.createElement("span");
  value2Label.textContent = "to";
  value2Label.style.cssText = "font-size:11px;opacity:0.6;";
  const value2Input = document.createElement("input");
  value2Input.type = "number";
  value2Input.placeholder = "Value2";
  value2Input.style.cssText = "width:90px;padding:5px 8px;border-radius:6px;border:1px solid rgba(128,128,128,0.3);background:rgba(128,128,128,0.08);font-size:12px;color:inherit;outline:none;";
  value2Wrap.append(value2Label, value2Input);

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.placeholder = "Label (optional)";
  labelInput.style.cssText = "width:130px;padding:5px 8px;border-radius:6px;border:1px solid rgba(128,128,128,0.3);background:rgba(128,128,128,0.08);font-size:12px;color:inherit;outline:none;";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = "#4466ff";
  colorInput.style.cssText = "width:34px;height:30px;padding:0 2px;border:1px solid rgba(128,128,128,0.3);cursor:pointer;border-radius:6px;background:none;flex-shrink:0;";

  const alphaInput = document.createElement("input");
  alphaInput.type = "range";
  alphaInput.min = "0";
  alphaInput.max = "100";
  alphaInput.value = "85";
  alphaInput.title = "Opacity";
  alphaInput.style.cssText = "width:60px;cursor:pointer;accent-color:rgba(128,128,128,0.7);flex-shrink:0;";

  const colorWrap = document.createElement("span");
  colorWrap.style.cssText = "display:inline-flex;align-items:center;gap:5px;";
  colorWrap.append(colorInput, alphaInput);

  const addBtn = document.createElement("button");
  addBtn.textContent = "Add";
  addBtn.style.cssText = "padding:5px 16px;border-radius:6px;border:1px solid rgba(128,128,128,0.3);cursor:pointer;font-size:12px;background:rgba(128,128,128,0.1);font-weight:600;color:inherit;";

  panel.append(typeSelect, valueInput, value2Wrap, labelInput, colorWrap, addBtn);

  const listDiv = document.createElement("div");
  listDiv.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:6px 0 4px;min-height:24px;font-size:11px;";

  typeSelect.addEventListener("change", () => {
    const isRegion = typeSelect.value === "hregion" || typeSelect.value === "vregion";
    value2Wrap.style.display = isRegion ? "flex" : "none";
    valueInput.placeholder = typeSelect.value === "vline" || typeSelect.value === "vregion" ? "X value" : "Y value";
    value2Input.placeholder = typeSelect.value === "vregion" ? "X value2" : "Y value2";
  });

  function renderList() {
    listDiv.innerHTML = "";
    interactiveAnnotations.forEach((ann, i) => {
      const tag = document.createElement("span");
      tag.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:10px;border:1px solid ${ann.color ?? "#888"};font-size:11px;`;
      const dot = document.createElement("span");
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${ann.color ?? "#888"};flex-shrink:0;`;
      const txt = document.createElement("span");
      txt.textContent = `${ann.type}${ann.label ? ` "${ann.label}"` : ""}`;
      const rmBtn = document.createElement("button");
      rmBtn.textContent = "×";
      rmBtn.style.cssText = "background:none;border:none;cursor:pointer;font-size:13px;line-height:1;padding:0 0 0 2px;opacity:0.6;";
      rmBtn.addEventListener("click", () => {
        interactiveAnnotations.splice(i, 1);
        interactiveChart.configure({ annotations: [...interactiveAnnotations] });
        renderList();
      });
      tag.append(dot, txt, rmBtn);
      listDiv.appendChild(tag);
    });
  }

  addBtn.addEventListener("click", () => {
    const type = typeSelect.value as AnnotationType;
    const value = parseFloat(valueInput.value);
    if (isNaN(value)) return;
    const label = labelInput.value.trim() || undefined;
    const alpha = (parseInt(alphaInput.value) / 100).toFixed(2);
    const hex = colorInput.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const color = `rgba(${r},${g},${b},${alpha})`;
    const ann: Annotation = { type, value, label, color };
    if ((type === "hregion" || type === "vregion") && value2Input.value) {
      ann.value2 = parseFloat(value2Input.value);
    }
    interactiveAnnotations.push(ann);
    interactiveChart.configure({ annotations: [...interactiveAnnotations] });
    renderList();
    valueInput.value = "";
    value2Input.value = "";
    labelInput.value = "";
  });

  const listLabel = document.createElement("span");
  listLabel.textContent = "Annotations:";
  listLabel.style.cssText = "font-size:11px;opacity:0.5;margin-right:2px;padding-top:2px;";

  const wrapper = interactiveContainer.parentElement!;
  wrapper.appendChild(panel);
  wrapper.appendChild(listLabel);
  wrapper.appendChild(listDiv);
}

function createThresholdDemos() {
  const data = generateData(200, "cyclic");
  const series = [{ label: "Signal", color: { r: 0.35, g: 0.6, b: 1 }, x: data.x, y: data.y }];
  const yMean = data.y.reduce((a, b) => a + b, 0) / data.y.length;

  manager.create({
    type: "line",
    container: document.getElementById("plugin-threshold-zones")!,
    series,
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
    thresholds: [
      { y: yMean + 25, label: "High Alert", color: "rgba(255,70,70,0.9)", fillAbove: "rgba(255,70,70,0.08)", lineWidth: 1.5, dash: [5, 3] as [number, number] },
      { y: yMean - 25, label: "Low Alert", color: "rgba(255,160,40,0.9)", fillBelow: "rgba(255,160,40,0.08)", lineWidth: 1.5, dash: [5, 3] as [number, number] },
    ],
  });

  manager.create({
    type: "line",
    container: document.getElementById("plugin-threshold-target")!,
    series,
    formatX: formatIndex,
    formatY: formatNumber,
    showTooltip: true,
    thresholds: [
      { y: yMean + 8, label: "Target", color: "rgba(80,200,120,0.9)", fillAbove: "rgba(80,200,120,0.07)", lineWidth: 2 },
    ],
  });
}

function createCrosshairDemos() {
  const data = generateData(300, "trending");
  const x = data.x.map((_, i) => 300 - 1 - i);
  const series = [{ label: "Price", color: { r: 0.3, g: 0.65, b: 1 }, x, y: data.y }];
  const base = { type: "line" as const, series, formatX: formatDate, formatY: formatPrice };

  manager.create({ ...base, container: document.getElementById("plugin-crosshair-both")!, crosshairX: true, crosshairY: true }).addPlugin(crosshairPlugin);
  manager.create({ ...base, container: document.getElementById("plugin-crosshair-x")!, crosshairX: true, crosshairY: false }).addPlugin(crosshairPlugin);
  manager.create({ ...base, container: document.getElementById("plugin-crosshair-custom")!, crosshairX: true, crosshairY: true, crosshairColor: "rgba(160,100,240,0.6)", crosshairDash: [8, 4] as [number, number], crosshairWidth: 1.5 }).addPlugin(crosshairPlugin);
}

function createWatermarkDemos() {
  const data = generateData(200, "trending");
  const series = [{ label: "Price", color: { r: 0.3, g: 0.6, b: 1 }, x: data.x, y: data.y }];
  const base = { type: "line" as const, series, formatX: formatIndex, formatY: formatPrice, showTooltip: true };

  manager.create({ ...base, container: document.getElementById("plugin-watermark-center")!, watermarkText: "DEMO", watermarkPosition: "center" as const, watermarkOpacity: 0.07 });
  manager.create({ ...base, container: document.getElementById("plugin-watermark-corner")!, watermarkText: "chartai", watermarkPosition: "top-right" as const, watermarkOpacity: 0.12, watermarkRotation: 0 });
  manager.create({ ...base, container: document.getElementById("plugin-watermark-strong")!, watermarkText: "PREVIEW", watermarkPosition: "center" as const, watermarkOpacity: 0.18, watermarkFontSize: 36 });
}

function createStatsDemos() {
  const data = generateData(500, "trending");
  const x = data.x.map((_, i) => 500 - 1 - i);
  const series = [{ label: "Price", color: { r: 0.35, g: 0.6, b: 1 }, x, y: data.y }];

  manager.create({ type: "line", container: document.getElementById("plugin-stats-tl")!, series, formatX: formatDate, formatY: formatPrice, showTooltip: true, statsPosition: "top-left" as const }).addPlugin(statsPlugin);

  const multiSeries = Array.from({ length: 3 }, (_, i) => {
    const d = generateData(400, "trending");
    const dx = d.x.map((_, idx) => 400 - 1 - idx);
    return { label: `S${i + 1}`, color: randomColor(), x: dx, y: d.y };
  });
  manager.create({ type: "line", container: document.getElementById("plugin-stats-tr")!, series: multiSeries, formatX: formatDate, formatY: formatPrice, showTooltip: true, statsPosition: "top-right" as const }).addPlugin(statsPlugin);
}

function createRulerDemos() {
  const data = generateData(500, "trending");
  const x = data.x.map((_, i) => 500 - 1 - i);
  const series = [{ label: "Price", color: { r: 0.35, g: 0.6, b: 1 }, x, y: data.y }];

  manager.create({ type: "line", container: document.getElementById("plugin-ruler-x")!, series, showTooltip: true, rulerAxis: "x" as const, rulerPosition: "bottom-right" as const, formatX: (v: number) => v.toFixed(0), formatY: (v: number) => v.toFixed(2) }).addPlugin(rulerPlugin);
  manager.create({ type: "line", container: document.getElementById("plugin-ruler-y")!, series, showTooltip: true, rulerAxis: "y" as const, rulerPosition: "bottom-right" as const, formatX: (v: number) => v.toFixed(0), formatY: (v: number) => v.toFixed(2) }).addPlugin(rulerPlugin);

  const data2 = generateData(500, "cyclic");
  const x2 = data2.x.map((_, i) => 500 - 1 - i);
  const series2 = [{ label: "Value", color: { r: 0.3, g: 0.8, b: 0.5 }, x: x2, y: data2.y }];
  manager.create({ type: "line", container: document.getElementById("plugin-ruler-both")!, series: series2, showTooltip: true, rulerAxis: "both" as const, rulerPosition: "bottom-right" as const, formatX: (v: number) => v.toFixed(0), formatY: (v: number) => v.toFixed(2) }).addPlugin(rulerPlugin);
}

function createTooltipPinDemos() {
  const data = generateData(300, "trending");
  const x = data.x.map((_, i) => 300 - 1 - i);
  manager.create({ type: "line", container: document.getElementById("plugin-tooltip-pin")!, series: [{ label: "Price", color: { r: 0.35, g: 0.6, b: 1 }, x, y: data.y }], formatX: formatDate, formatY: formatPrice, showTooltip: false, pinMax: 5 }).addPlugin(tooltipPinPlugin);

  const multiSeries = Array.from({ length: 3 }, (_, i) => {
    const d = generateData(300, "trending");
    return { label: `Series ${i + 1}`, color: randomColor(), x: d.x.map((_, idx) => 300 - 1 - idx), y: d.y };
  });
  manager.create({ type: "line", container: document.getElementById("plugin-tooltip-pin-multi")!, series: multiSeries, formatX: formatDate, formatY: formatPrice, showTooltip: false, pinMax: 5 }).addPlugin(tooltipPinPlugin);
}

function createMinimapDemos() {
  const data = generateData(2000, "stock");
  const x = data.x.map((_, i) => 2000 - 1 - i);
  const series = [{ label: "Price", color: { r: 0.35, g: 0.6, b: 1 }, x, y: data.y }];

  manager.create({ type: "line", container: document.getElementById("plugin-minimap-br")!, series, formatX: formatDate, formatY: formatPrice, showTooltip: true, minimapPosition: "bottom-right" as const, minimapSize: 110 }).addPlugin(minimapPlugin);
  manager.create({ type: "line", container: document.getElementById("plugin-minimap-tl")!, series, formatX: formatDate, formatY: formatPrice, showTooltip: true, minimapPosition: "top-left" as const, minimapSize: 110 }).addPlugin(minimapPlugin);
}

function createRangeSelectorDemo() {
  const data = generateData(1000, "stock");
  const x = data.x.map((_, i) => 1000 - 1 - i);
  manager.create({
    type: "line",
    container: document.getElementById("plugin-range-selector")!,
    series: [{ label: "Price", color: { r: 0.35, g: 0.6, b: 1 }, x, y: data.y }],
    formatX: formatDate,
    formatY: formatPrice,
    showTooltip: true,
    rangeSelectorHeight: 56,
  }).addPlugin(rangeSelectorPlugin);
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

init();
