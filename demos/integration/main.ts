// Integration test - imports library as if installed from NPM
import { ChartManager, registerPlugin } from "chartai";
import type { ChartType } from "chartai";
import { hoverPlugin } from "chartai/plugins/hover";
import { labelsPlugin } from "chartai/plugins/labels";
import { zoomPlugin } from "chartai/plugins/zoom";

interface Test {
  name: string;
  description: string;
  run: () => Promise<boolean>;
  chartId?: string;
}

const tests: Test[] = [];
let manager: ChartManager;

// Test: Library Import
tests.push({
  name: "Library Import",
  description: "Can import ChartManager from package",
  run: async () => {
    return typeof ChartManager !== "undefined" && ChartManager.getInstance !== undefined;
  },
});

// Test: WebGPU Initialization
tests.push({
  name: "WebGPU Init",
  description: "ChartManager initializes and WebGPU is available",
  run: async () => {
    manager = ChartManager.getInstance();
    const success = await manager.init();
    return success === true;
  },
});

// Test: Plugin Registration
tests.push({
  name: "Plugin Registration",
  description: "Can register all three plugins",
  run: async () => {
    try {
      registerPlugin(labelsPlugin);
      registerPlugin(zoomPlugin());
      registerPlugin(hoverPlugin);
      return true;
    } catch (e) {
      console.error("Plugin registration failed:", e);
      return false;
    }
  },
});

// Test: Create Scatter Chart
tests.push({
  name: "Scatter Chart",
  description: "Create scatter chart with 1000 points",
  run: async () => {
    try {
      const container = document.createElement("div");
      container.className = "chart-container";
      
      const x = Array.from({ length: 1000 }, (_, i) => i);
      const y = Array.from({ length: 1000 }, () => Math.random() * 100);
      
      const id = manager.create({
        type: "scatter",
        container,
        series: [{ label: "Test Data", color: { r: 0.4, g: 0.6, b: 1 }, x, y }],
        showTooltip: true,
      });
      
      tests[tests.length - 1].chartId = id;
      return typeof id === "string" && id.length > 0;
    } catch (e) {
      console.error("Scatter chart creation failed:", e);
      return false;
    }
  },
});

// Test: Create Line Chart
tests.push({
  name: "Line Chart",
  description: "Create line chart with multiple series",
  run: async () => {
    try {
      const container = document.createElement("div");
      container.className = "chart-container";
      
      const x = Array.from({ length: 500 }, (_, i) => i);
      const series = [
        {
          label: "Series 1",
          color: { r: 1, g: 0.3, b: 0.3 },
          x,
          y: x.map((v) => Math.sin(v * 0.1) * 50 + 50),
        },
        {
          label: "Series 2",
          color: { r: 0.3, g: 1, b: 0.3 },
          x,
          y: x.map((v) => Math.cos(v * 0.1) * 50 + 50),
        },
      ];
      
      const id = manager.create({
        type: "line",
        container,
        series,
        showTooltip: true,
      });
      
      tests[tests.length - 1].chartId = id;
      return typeof id === "string" && id.length > 0;
    } catch (e) {
      console.error("Line chart creation failed:", e);
      return false;
    }
  },
});

// Test: Create Bar Chart
tests.push({
  name: "Bar Chart",
  description: "Create bar chart with positive values",
  run: async () => {
    try {
      const container = document.createElement("div");
      container.className = "chart-container";
      
      const x = Array.from({ length: 50 }, (_, i) => i);
      const y = Array.from({ length: 50 }, () => Math.random() * 100);
      
      const id = manager.create({
        type: "bar",
        container,
        series: [{ label: "Bars", color: { r: 0.8, g: 0.4, b: 1 }, x, y }],
        showTooltip: true,
      });
      
      tests[tests.length - 1].chartId = id;
      return typeof id === "string" && id.length > 0;
    } catch (e) {
      console.error("Bar chart creation failed:", e);
      return false;
    }
  },
});

// Test: Update Series
tests.push({
  name: "Update Series",
  description: "Dynamically update chart data",
  run: async () => {
    try {
      const prevTest = tests.find((t) => t.name === "Scatter Chart");
      if (!prevTest?.chartId) return false;
      
      const x = Array.from({ length: 500 }, (_, i) => i);
      const y = Array.from({ length: 500 }, () => Math.random() * 50 + 50);
      
      manager.updateSeries(prevTest.chartId, [
        { label: "Updated", color: { r: 1, g: 0.7, b: 0.2 }, x, y },
      ]);
      
      return true;
    } catch (e) {
      console.error("Update series failed:", e);
      return false;
    }
  },
});

// Test: Zoom Mode
tests.push({
  name: "Zoom Mode",
  description: "Set and get zoom modes",
  run: async () => {
    try {
      const prevTest = tests.find((t) => t.name === "Line Chart");
      if (!prevTest?.chartId) return false;
      
      manager.setZoomMode(prevTest.chartId, "x-only");
      const mode = manager.getZoomMode(prevTest.chartId);
      
      return mode === "x-only";
    } catch (e) {
      console.error("Zoom mode test failed:", e);
      return false;
    }
  },
});

// Test: Reset View
tests.push({
  name: "Reset View",
  description: "Reset chart view to default",
  run: async () => {
    try {
      const prevTest = tests.find((t) => t.name === "Line Chart");
      if (!prevTest?.chartId) return false;
      
      manager.resetView(prevTest.chartId);
      return true;
    } catch (e) {
      console.error("Reset view failed:", e);
      return false;
    }
  },
});

// Test: Theme Switching
tests.push({
  name: "Theme Switch",
  description: "Toggle dark/light theme",
  run: async () => {
    try {
      manager.setTheme(false); // Light mode
      await new Promise((resolve) => setTimeout(resolve, 100));
      manager.setTheme(true); // Dark mode
      return true;
    } catch (e) {
      console.error("Theme switch failed:", e);
      return false;
    }
  },
});

// Test: Sync Views
tests.push({
  name: "Sync Views",
  description: "Enable synchronized view across charts",
  run: async () => {
    try {
      manager.setSyncViews(true);
      const isSynced = manager.syncViews;
      manager.setSyncViews(false);
      return isSynced === true;
    } catch (e) {
      console.error("Sync views failed:", e);
      return false;
    }
  },
});

// Test: Point Size
tests.push({
  name: "Point Size",
  description: "Change scatter point size",
  run: async () => {
    try {
      const prevTest = tests.find((t) => t.name === "Scatter Chart");
      if (!prevTest?.chartId) return false;
      
      manager.setPointSize(prevTest.chartId, 6);
      return true;
    } catch (e) {
      console.error("Point size test failed:", e);
      return false;
    }
  },
});

// Test: Stats Callback
tests.push({
  name: "Stats Callback",
  description: "Register and receive stats updates",
  run: async () => {
    try {
      let received = false;
      const unsubscribe = manager.onStats((stats) => {
        received = stats.total >= 0;
      });
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      unsubscribe();
      
      return received;
    } catch (e) {
      console.error("Stats callback failed:", e);
      return false;
    }
  },
});

// Test: Chart Destruction
tests.push({
  name: "Destroy Chart",
  description: "Properly cleanup and destroy a chart",
  run: async () => {
    try {
      const container = document.createElement("div");
      container.className = "chart-container";
      
      const id = manager.create({
        type: "scatter",
        container,
        series: [{ label: "Test", color: { r: 1, g: 1, b: 1 }, x: [1, 2, 3], y: [1, 2, 3] }],
      });
      
      const countBefore = manager.getChartCount();
      manager.destroy(id);
      const countAfter = manager.getChartCount();
      
      return countAfter < countBefore;
    } catch (e) {
      console.error("Destroy chart failed:", e);
      return false;
    }
  },
});

// UI Functions
function updateStatus(text: string, type: "pending" | "success" | "error") {
  const statusEl = document.getElementById("status")!;
  const statusText = document.getElementById("status-text")!;
  
  statusEl.className = `status ${type}`;
  statusText.textContent = text;
}

function createTestCard(test: Test, index: number): HTMLElement {
  const card = document.createElement("div");
  card.className = "test-card";
  card.id = `test-${index}`;
  
  card.innerHTML = `
    <div class="test-header">
      <div class="test-title">${test.name}</div>
      <div class="test-status pending">PENDING</div>
    </div>
    <div class="test-info">${test.description}</div>
  `;
  
  return card;
}

function updateTestStatus(index: number, status: "pending" | "pass" | "fail") {
  const card = document.getElementById(`test-${index}`);
  if (!card) return;
  
  const statusEl = card.querySelector(".test-status")!;
  statusEl.className = `test-status ${status}`;
  statusEl.textContent = status === "pass" ? "✓ PASS" : status === "fail" ? "✗ FAIL" : "PENDING";
}

function addChartToTest(index: number, container: HTMLElement) {
  const card = document.getElementById(`test-${index}`);
  if (card) {
    card.appendChild(container);
  }
}

async function runTests() {
  updateStatus("Running tests...", "pending");
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    updateTestStatus(i, "pending");
    
    try {
      const result = await test.run();
      
      if (result) {
        updateTestStatus(i, "pass");
        passed++;
        
        // Add chart container for visualization tests
        if (test.chartId) {
          const chartEl = document.querySelector(`[data-chart-id="${test.chartId}"]`);
          if (chartEl?.parentElement) {
            addChartToTest(i, chartEl.parentElement as HTMLElement);
          }
        }
      } else {
        updateTestStatus(i, "fail");
        failed++;
      }
    } catch (e) {
      console.error(`Test "${test.name}" threw error:`, e);
      updateTestStatus(i, "fail");
      failed++;
    }
    
    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  
  // Update summary
  const total = tests.length;
  document.getElementById("total-tests")!.textContent = total.toString();
  document.getElementById("passed-tests")!.textContent = passed.toString();
  document.getElementById("failed-tests")!.textContent = failed.toString();
  document.getElementById("summary")!.style.display = "block";
  
  if (failed === 0) {
    updateStatus(`✓ All ${total} tests passed!`, "success");
  } else {
    updateStatus(`✗ ${failed} of ${total} tests failed`, "error");
  }
}

function clearAll() {
  const testsContainer = document.getElementById("tests")!;
  testsContainer.innerHTML = "";
  document.getElementById("summary")!.style.display = "none";
  updateStatus("Ready to run tests", "pending");
  
  // Re-render test cards
  tests.forEach((test, i) => {
    testsContainer.appendChild(createTestCard(test, i));
  });
}

// Initialize
document.getElementById("run-tests")!.addEventListener("click", runTests);
document.getElementById("clear-all")!.addEventListener("click", clearAll);

document.getElementById("toggle-theme")!.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  document.body.style.background = isDark ? "#0a0a0a" : "#ffffff";
  document.body.style.color = isDark ? "#e5e5e5" : "#1a1a1a";
  manager?.setTheme(isDark);
});

// Render initial test cards
const testsContainer = document.getElementById("tests")!;
tests.forEach((test, i) => {
  testsContainer.appendChild(createTestCard(test, i));
});

updateStatus("Ready to run tests", "pending");
