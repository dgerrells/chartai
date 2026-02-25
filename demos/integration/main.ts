import { ChartManager as manager } from "chartai";
import type { Chart } from "chartai";
import { LineChart } from "chartai/charts/line";
import { AreaChart } from "chartai/charts/area";
import { ScatterChart } from "chartai/charts/scatter";
import { BarChart } from "chartai/charts/bar";
import { hoverPlugin } from "chartai/plugins/hover";
import { labelsPlugin } from "chartai/plugins/labels";
import { zoomPlugin } from "chartai/plugins/zoom";

// manager is the imported singleton
let scatter: Chart;
let line: Chart;
let bar: Chart;
let scatterRaw: Chart;
let lineLarge: Chart;
let isDarkTheme = true;
let syncEnabled = false;

async function init() {
  manager.use(LineChart);
  manager.use(AreaChart);
  manager.use(ScatterChart);
  manager.use(BarChart);
  manager.use(labelsPlugin);
  manager.use(zoomPlugin());
  manager.use(hoverPlugin);

  const success = await manager.init();
  if (!success) { console.error("Failed to initialize ChartManager"); return; }

  const scatterX = Array.from({ length: 2000 }, (_, i) => i);
  scatter = manager.create({
    type: "scatter",
    container: document.getElementById("scatter-chart")!,
    series: [{ label: "Dataset A", color: { r: 0.3, g: 0.6, b: 1 }, x: scatterX, y: Array.from({ length: 2000 }, () => Math.random() * 100) }],
    showTooltip: true,
  });

  const lineX = Array.from({ length: 1000 }, (_, i) => i);
  line = manager.create({
    type: "line",
    container: document.getElementById("line-chart")!,
    series: [
      { label: "Sine",    color: { r: 1, g: 0.3, b: 0.3 }, x: lineX, y: lineX.map((v) => Math.sin(v * 0.02) * 40 + 50) },
      { label: "Cosine",  color: { r: 0.3, g: 0.9, b: 0.3 }, x: lineX, y: lineX.map((v) => Math.cos(v * 0.02) * 40 + 50) },
      { label: "Tan",     color: { r: 0.9, g: 0.7, b: 0.2 }, x: lineX, y: lineX.map((v) => Math.tan(v * 0.01) * 10 + 50) },
    ],
    showTooltip: true,
  });

  const barX = Array.from({ length: 60 }, (_, i) => i);
  bar = manager.create({
    type: "bar",
    container: document.getElementById("bar-chart")!,
    series: [{ label: "Revenue", color: { r: 0.6, g: 0.4, b: 0.9 }, x: barX, y: Array.from({ length: 60 }, () => Math.random() * 80 + 20) }],
    showTooltip: true,
  });

  const noPluginX = Array.from({ length: 500 }, (_, i) => i);
  scatterRaw = manager.create({
    type: "scatter",
    container: document.getElementById("scatter-no-plugins")!,
    series: [{ label: "Raw Data", color: { r: 0.5, g: 0.5, b: 0.5 }, x: noPluginX, y: Array.from({ length: 500 }, () => Math.random() * 100) }],
    showTooltip: false,
  });
  scatterRaw.removePlugin("labels");
  scatterRaw.removePlugin("zoom");
  scatterRaw.removePlugin("hover");

  const largeX = Array.from({ length: 10000 }, (_, i) => i);
  lineLarge = manager.create({
    type: "line",
    container: document.getElementById("line-large")!,
    series: [
      { label: "Signal 1", color: { r: 0.2, g: 0.8, b: 1 }, x: largeX, y: largeX.map((v) => Math.sin(v * 0.005) * 30 + 50 + Math.random() * 10) },
      { label: "Signal 2", color: { r: 1, g: 0.5, b: 0.2 }, x: largeX, y: largeX.map((v) => Math.cos(v * 0.003) * 25 + 50 + Math.random() * 10) },
    ],
    showTooltip: true,
  });

  manager.onStats((stats) => {
    document.getElementById("stat-total")!.textContent = stats.total.toLocaleString();
    document.getElementById("stat-visible")!.textContent = stats.active.toLocaleString();
    document.getElementById("stat-fps")!.textContent = "60";
  });

  console.log("✓ All charts initialized");
}

document.getElementById("toggle-theme")!.addEventListener("click", () => {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle("light");
  manager.setTheme(isDarkTheme);
});

document.getElementById("toggle-sync")!.addEventListener("click", (e) => {
  syncEnabled = !syncEnabled;
  manager.setSyncViews(syncEnabled);
  (e.target as HTMLElement).textContent = syncEnabled ? "Disable Sync Views" : "Enable Sync Views";
});

document.getElementById("update-data")!.addEventListener("click", () => {
  const newX = Array.from({ length: 1500 }, (_, i) => i);
  scatter.setData([{ label: "Updated Dataset", color: { r: 1, g: 0.5, b: 0.2 }, x: newX, y: Array.from({ length: 1500 }, () => Math.random() * 120) }]);

  const barX = Array.from({ length: 80 }, (_, i) => i);
  bar.setData([{ label: "Updated Revenue", color: { r: 0.2, g: 0.9, b: 0.5 }, x: barX, y: Array.from({ length: 80 }, () => Math.random() * 100) }]);
});

document.getElementById("reset-zoom")!.addEventListener("click", () => {
  scatter.resetView(); line.resetView(); bar.resetView(); scatterRaw.resetView(); lineLarge.resetView();
});

init();
