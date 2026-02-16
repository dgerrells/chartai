// ChartAI Landing Page

import { ChartManager, registerPlugin } from "../src/chart-library.ts";
import type { ChartSeries } from "../src/chart-library.ts";
import { labelsPlugin } from "../src/plugins/labels.ts";
import { zoomPlugin } from "../src/plugins/zoom.ts";
import { hoverPlugin } from "../src/plugins/hover.ts";

registerPlugin(labelsPlugin);
registerPlugin(zoomPlugin());
registerPlugin(hoverPlugin);

type DataPattern = "stock" | "trending" | "declining" | "spikey" | "cyclic";

let manager: ChartManager;
let isDark = document.documentElement.classList.contains("dark");

// Live update state
let liveUpdateSpeed = 1; // per second
let liveUpdateInterval: number | null = null;
let liveAccumulate = false; // accumulate vs ring buffer
let liveLineId: string;
let liveScatterId: string;
let liveLine2Id: string;
let liveDataX: number[] = [];
let liveDataY1: number[] = [];
let liveDataY2: number[] = [];
let liveDataY3: number[] = [];

// Big data chart IDs
let bigdataLineId: string | null = null;
let bigdataScatterId: string | null = null;
let bigseriesLineId: string | null = null;

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

async function init() {
  manager = ChartManager.getInstance();
  const success = await manager.init();

  if (!success) {
    alert("WebGPU not available. Please use a supported browser.");
    return;
  }

  setupTheme();
  createBasicCharts();
  createSeriesCharts();
  createSpikesChart();
  createLiveCharts();
  setupBigDataControls();
  setupBigSeriesControls();
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
  manager.create({
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
}

function createSeriesCharts() {
  // Bar chart - 25 points × 3 series (same pattern, varying heights)
  const barSeries: ChartSeries[] = [];
  const baseData = generateData(25, "trending");
  const heightMultipliers = [1.0, 0.7, 1.3]; // Slight height variations
  
  for (let i = 0; i < 3; i++) {
    const data = generateData(25, "trending");
    const adjustedY = data.y.map(val => val * heightMultipliers[i]);
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

  liveLineId = manager.create({
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

  liveScatterId = manager.create({
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

  liveLine2Id = manager.create({
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
  const accumulateToggle = document.getElementById("accumulate-toggle") as HTMLInputElement;
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
    const nextX = liveDataX.length > 0 ? liveDataX[liveDataX.length - 1] + 1 : 0;
    const lastY1 = liveDataY1.length > 0 ? liveDataY1[liveDataY1.length - 1] : 50;
    const lastY2 = liveDataY2.length > 0 ? liveDataY2[liveDataY2.length - 1] : 50;
    const lastY3 = liveDataY3.length > 0 ? liveDataY3[liveDataY3.length - 1] : 50;
    
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

    // Update charts
    manager.updateSeries(liveLineId, [
      {
        label: "Live Data",
        color: { r: 0.2, g: 0.8, b: 0.4 },
        x: [...liveDataX],
        y: [...liveDataY1],
      },
    ]);

    manager.updateSeries(liveScatterId, [
      {
        label: "Live Data",
        color: { r: 0.9, g: 0.3, b: 0.7 },
        x: [...liveDataX],
        y: [...liveDataY2],
      },
    ]);

    manager.updateSeries(liveLine2Id, [
      {
        label: "Live Data",
        color: { r: 0.4, g: 0.5, b: 1 },
        x: [...liveDataX],
        y: [...liveDataY3],
      },
    ]);

    // Update stats
    const mode = liveAccumulate ? "Accumulate" : "Ring Buffer";
    document.getElementById("live-stats")!.textContent = `Points: ${liveDataX.length} (${mode})`;
  }, intervalMs);
}

function setupBigDataControls() {
  const generateBtn = document.getElementById("bigdata-generate")!;
  const countInput = document.getElementById("bigdata-count") as HTMLInputElement;
  const statsDiv = document.getElementById("bigdata-stats")!;

  generateBtn.addEventListener("click", () => {
    const count = parseInt(countInput.value) || 1000000;
    generateBtn.setAttribute("disabled", "true");
    statsDiv.textContent = "Generating...";

    setTimeout(() => {
      const t0 = performance.now();

      // Destroy old charts if they exist
      if (bigdataLineId) manager.destroy(bigdataLineId);
      if (bigdataScatterId) manager.destroy(bigdataScatterId);

      // Generate data with stock pattern for line
      const lineData = generateData(count, "stock");
      // Generate cyclic pattern for scatter
      const scatterData = generateData(count, "cyclic");

      // Create line chart
      bigdataLineId = manager.create({
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

      // Create scatter chart
      bigdataScatterId = manager.create({
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
      
      document.getElementById("bigdata-line-info")!.textContent = countFormatted;
      document.getElementById("bigdata-scatter-info")!.textContent = countFormatted;
      statsDiv.textContent = `Generated in ${elapsed.toFixed(0)}ms`;
      generateBtn.removeAttribute("disabled");
    }, 50);
  });
}

function setupBigSeriesControls() {
  const generateBtn = document.getElementById("bigseries-generate")!;
  const seriesInput = document.getElementById("bigseries-series") as HTMLInputElement;
  const pointsInput = document.getElementById("bigseries-points") as HTMLInputElement;
  const statsDiv = document.getElementById("bigseries-stats")!;

  generateBtn.addEventListener("click", () => {
    const seriesCount = parseInt(seriesInput.value) || 1000;
    const pointsPerSeries = parseInt(pointsInput.value) || 1000;
    
    generateBtn.setAttribute("disabled", "true");
    statsDiv.textContent = "Generating...";

    setTimeout(() => {
      const t0 = performance.now();

      // Destroy old chart if it exists
      if (bigseriesLineId) manager.destroy(bigseriesLineId);

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

      // Create chart
      bigseriesLineId = manager.create({
        type: "line",
        container: document.getElementById("bigseries-line")!,
        series,
        formatX: formatDate,
        formatY: formatPrice,
        showTooltip: true,
      });

      const elapsed = performance.now() - t0;
      const totalPoints = seriesCount * pointsPerSeries;
      const formatted = totalPoints >= 1e6 
        ? (totalPoints / 1e6).toFixed(1) + "M" 
        : (totalPoints / 1e3).toFixed(0) + "k";
      
      document.getElementById("bigseries-info")!.textContent = 
        `${seriesCount} series × ${pointsPerSeries} pts = ${formatted} total`;
      statsDiv.textContent = `Generated in ${elapsed.toFixed(0)}ms`;
      generateBtn.removeAttribute("disabled");
    }, 50);
  });
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
