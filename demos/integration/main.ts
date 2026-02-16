// Integration demo - imports library as if installed from NPM
import { ChartManager, registerPlugin } from "chartai";
import { hoverPlugin } from "chartai/plugins/hover";
import { labelsPlugin } from "chartai/plugins/labels";
import { zoomPlugin } from "chartai/plugins/zoom";

let manager: ChartManager;
let scatterChartId: string;
let lineChartId: string;
let barChartId: string;
let scatterNoPluginsId: string;
let lineLargeId: string;
let isDarkTheme = true;
let syncEnabled = false;

async function init() {
  // Initialize ChartManager
  manager = ChartManager.getInstance();
  const success = await manager.init();

  if (!success) {
    console.error("Failed to initialize ChartManager");
    return;
  }

  // Register plugins globally
  registerPlugin(labelsPlugin);
  registerPlugin(zoomPlugin());
  registerPlugin(hoverPlugin);

  // 1. Scatter chart with all plugins
  const scatterContainer = document.getElementById("scatter-chart")!;
  const scatterX = Array.from({ length: 2000 }, (_, i) => i);
  const scatterY = Array.from({ length: 2000 }, () => Math.random() * 100);

  scatterChartId = manager.create({
    type: "scatter",
    container: scatterContainer,
    series: [
      {
        label: "Dataset A",
        color: { r: 0.3, g: 0.6, b: 1 },
        x: scatterX,
        y: scatterY,
      },
    ],
    showTooltip: true,
  });

  // 2. Line chart with multiple series
  const lineContainer = document.getElementById("line-chart")!;
  const lineX = Array.from({ length: 1000 }, (_, i) => i);

  lineChartId = manager.create({
    type: "line",
    container: lineContainer,
    series: [
      {
        label: "Sine",
        color: { r: 1, g: 0.3, b: 0.3 },
        x: lineX,
        y: lineX.map((v) => Math.sin(v * 0.02) * 40 + 50),
      },
      {
        label: "Cosine",
        color: { r: 0.3, g: 0.9, b: 0.3 },
        x: lineX,
        y: lineX.map((v) => Math.cos(v * 0.02) * 40 + 50),
      },
      {
        label: "Tan (scaled)",
        color: { r: 0.9, g: 0.7, b: 0.2 },
        x: lineX,
        y: lineX.map((v) => Math.tan(v * 0.01) * 10 + 50),
      },
    ],
    showTooltip: true,
  });

  // 3. Bar chart
  const barContainer = document.getElementById("bar-chart")!;
  const barX = Array.from({ length: 60 }, (_, i) => i);
  const barY = Array.from({ length: 60 }, () => Math.random() * 80 + 20);

  barChartId = manager.create({
    type: "bar",
    container: barContainer,
    series: [
      {
        label: "Revenue",
        color: { r: 0.6, g: 0.4, b: 0.9 },
        x: barX,
        y: barY,
      },
    ],
    showTooltip: true,
  });

  // 4. Scatter without plugins (disable tooltip to test raw chart)
  const scatterNoPluginsContainer =
    document.getElementById("scatter-no-plugins")!;
  const noPluginX = Array.from({ length: 500 }, (_, i) => i);
  const noPluginY = Array.from({ length: 500 }, () => Math.random() * 100);

  scatterNoPluginsId = manager.create({
    type: "scatter",
    container: scatterNoPluginsContainer,
    series: [
      {
        label: "Raw Data",
        color: { r: 0.5, g: 0.5, b: 0.5 },
        x: noPluginX,
        y: noPluginY,
      },
    ],
    showTooltip: false, // No interactions
  });

  // 5. Large dataset line chart
  const lineLargeContainer = document.getElementById("line-large")!;
  const largeX = Array.from({ length: 10000 }, (_, i) => i);

  lineLargeId = manager.create({
    type: "line",
    container: lineLargeContainer,
    series: [
      {
        label: "Signal 1",
        color: { r: 0.2, g: 0.8, b: 1 },
        x: largeX,
        y: largeX.map(
          (v) => Math.sin(v * 0.005) * 30 + 50 + Math.random() * 10,
        ),
      },
      {
        label: "Signal 2",
        color: { r: 1, g: 0.5, b: 0.2 },
        x: largeX,
        y: largeX.map(
          (v) => Math.cos(v * 0.003) * 25 + 50 + Math.random() * 10,
        ),
      },
    ],
    showTooltip: true,
  });

  // Set up stats updates
  manager.onStats((stats) => {
    document.getElementById("stat-total")!.textContent =
      stats.total.toLocaleString();
    document.getElementById("stat-visible")!.textContent =
      stats.active.toLocaleString();
    document.getElementById("stat-charts")!.textContent = manager
      .getChartCount()
      .toString();
    document.getElementById("stat-fps")!.textContent = "60";
  });

  console.log("✓ All charts initialized successfully");
  console.log(`  • ${manager.getChartCount()} charts created`);
}

// Button handlers
document.getElementById("toggle-theme")!.addEventListener("click", () => {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle("light");
  manager.setTheme(isDarkTheme);
  console.log(`Theme: ${isDarkTheme ? "dark" : "light"}`);
});

document.getElementById("toggle-sync")!.addEventListener("click", () => {
  syncEnabled = !syncEnabled;
  manager.setSyncViews(syncEnabled);
  const btn = document.getElementById("toggle-sync")!;
  btn.textContent = syncEnabled ? "Disable Sync Views" : "Enable Sync Views";
  console.log(`Sync views: ${syncEnabled ? "enabled" : "disabled"}`);
});

document.getElementById("update-data")!.addEventListener("click", () => {
  // Update scatter chart with new random data
  const newX = Array.from({ length: 1500 }, (_, i) => i);
  const newY = Array.from({ length: 1500 }, () => Math.random() * 120);

  manager.updateSeries(scatterChartId, [
    {
      label: "Updated Dataset",
      color: { r: 1, g: 0.5, b: 0.2 },
      x: newX,
      y: newY,
    },
  ]);

  // Update bar chart too
  const barX = Array.from({ length: 80 }, (_, i) => i);
  const barY = Array.from({ length: 80 }, () => Math.random() * 100);

  manager.updateSeries(barChartId, [
    {
      label: "Updated Revenue",
      color: { r: 0.2, g: 0.9, b: 0.5 },
      x: barX,
      y: barY,
    },
  ]);

  console.log("✓ Data updated");
});

document.getElementById("reset-zoom")!.addEventListener("click", () => {
  manager.resetView(scatterChartId);
  manager.resetView(lineChartId);
  manager.resetView(barChartId);
  manager.resetView(scatterNoPluginsId);
  manager.resetView(lineLargeId);
  console.log("✓ All zoom levels reset");
});

// Initialize on load
init();
