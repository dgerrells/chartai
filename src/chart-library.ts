// ChartManager - ChartAI
export type ChartType = "scatter" | "line" | "bar";
export type ZoomMode = "both" | "x-only" | "y-only" | "none";

export interface ChartSeries {
  label: string;
  color: { r: number; g: number; b: number };
  x: number[];
  y: number[];
}

export interface HoverData {
  x: number;
  y: number;
  index: number;
  screenX: number;
  screenY: number;
  seriesIndex: number;
  seriesLabel: string;
}

export interface ChartConfig {
  type: ChartType;
  container: HTMLElement;
  series: ChartSeries[];
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  onHover?: (data: HoverData | null) => void;
  zoomMode?: ZoomMode;
  labelSize?: number;
  pointSize?: number;
  defaultBounds?: {
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  };
  /** Max data samples scanned per pixel column for min/max (line/bar). 0 = unlimited. Default: 1000. */
  maxSamplesPerPixel?: number;
  /** Background color [r, g, b] (0-1 range). Default: derived from theme. */
  bgColor?: [number, number, number];
  /** CSS color string for axis label text. Default: derived from theme. */
  textColor?: string;
  /** CSS color string for grid lines. Default: derived from theme. */
  gridColor?: string;
  /** CSS font-family for axis labels. Default: system font stack. */
  fontFamily?: string;
  /** Show built-in hover tooltip with crosshairs on the axis canvas. Default: false. */
  showTooltip?: boolean;
  /** Pill tween half-life in ms (time to cover half remaining distance). Default: 60. */
  pillDecayMs?: number;
}

export interface ChartStats {
  fps: number;
  renderMs: number;
  total: number;
  active: number;
}

export interface InternalChart {
  id: string;
  config: ChartConfig;
  el: HTMLElement;
  backCanvas: HTMLCanvasElement;
  axisCanvas: HTMLCanvasElement;
  /** Logical dimensions in CSS pixels (for plugin coordinate calculations) */
  width: number;
  height: number;
  series: Array<{
    label: string;
    color: { r: number; g: number; b: number };
    rawX: number[];
    rawY: number[];
  }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  view: { panX: number; panY: number; zoomX: number; zoomY: number };
  zoomMode: ZoomMode;
  visible: boolean;
  /** Shared drag flag — set by zoom plugin, read by hover plugin. */
  dragging: boolean;
  bgColor?: [number, number, number];
  textColor?: string;
  gridColor?: string;
  fontFamily?: string;
  /** Momentum animation frame id (shared for cross-concern cancellation). */
  momentum: number | null;
  /** Binary-search nearest data point to a screen coordinate. */
  findNearestPoint(
    screenX: number,
    screenY: number,
    width: number,
    height: number,
  ): HoverData | null;
}

export interface ChartPlugin {
  name: string;
  /** Called when a chart is created. `el` is the canvas-wrap element. */
  install?(chart: InternalChart, el: HTMLElement): void;
  /** Called when a chart is destroyed. */
  uninstall?(chart: InternalChart): void;
  /** Called on the back canvas (behind GPU). Draw here to appear behind chart data. */
  beforeDraw?(ctx: CanvasRenderingContext2D, chart: InternalChart): void;
  /** Called on the front canvas (above GPU). Plugins paint in registration order. */
  afterDraw?(ctx: CanvasRenderingContext2D, chart: InternalChart): void;
}

const globalPlugins: ChartPlugin[] = [];

export function registerPlugin(plugin: ChartPlugin): void {
  if (!globalPlugins.some((p) => p.name === plugin.name)) {
    globalPlugins.push(plugin);
  }
}

export function unregisterPlugin(name: string): void {
  const idx = globalPlugins.findIndex((p) => p.name === name);
  if (idx >= 0) globalPlugins.splice(idx, 1);
}

export function getPlugins(): readonly ChartPlugin[] {
  return globalPlugins;
}

type StatsCallback = (stats: ChartStats) => void;

export class ChartManager {
  private static instance: ChartManager | null = null;

  static readonly MARGIN = { left: 55, right: 10, top: 8, bottom: 45 };
  static readonly HOVER_MAX_DISTANCE_PX = 50;
  static readonly MIN_ZOOM = 0.1;
  static readonly MAX_ZOOM = 10000000;
  static readonly DEFAULT_LABEL_SIZE = 12;
  static readonly DEFAULT_FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

  private static resizeCanvas(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    cssWidth: number,
    cssHeight: number,
  ): void {
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    if (canvas instanceof HTMLCanvasElement) {
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
  }

  private worker: Worker | null = null;
  private charts = new Map<string, InternalChart>();
  private chartIdCounter = 0;
  private _syncViews = false;
  private _isDark = false;
  private statsCallbacks: StatsCallback[] = [];
  private currentStats: ChartStats = {
    fps: 0,
    renderMs: 0,
    total: 0,
    active: 0,
  };

  private visibilityObserver: IntersectionObserver;
  private resizeObserver: ResizeObserver;

  private constructor() {
    this._isDark = document.documentElement.classList.contains("dark");

    this.visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.chartId;
          if (id) {
            const chart = this.charts.get(id);
            if (chart) {
              chart.visible = entry.isIntersecting;
              this.worker?.postMessage({
                type: "set-visibility",
                id,
                visible: entry.isIntersecting,
              });
            }
          }
        }
      },
      { threshold: 0.01 },
    );

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.chartId;
        if (!id) continue;
        const chart = this.charts.get(id);
        if (!chart) continue;

        const { width, height } = entry.contentRect;
        if (width <= 0 || height <= 0) continue;

        chart.width = width;
        chart.height = height;

        const dpr = devicePixelRatio || 1;
        this.worker?.postMessage({
          type: "resize",
          id,
          width: Math.round(width * dpr),
          height: Math.round(height * dpr),
        });
        ChartManager.resizeCanvas(chart.backCanvas, width, height);
        ChartManager.resizeCanvas(chart.axisCanvas, width, height);
        this.drawChart(chart);
      }
    });
  }

  static getInstance(): ChartManager {
    if (!ChartManager.instance) {
      ChartManager.instance = new ChartManager();
    }
    return ChartManager.instance;
  }

  get isDark(): boolean {
    return this._isDark;
  }

  get syncViews(): boolean {
    return this._syncViews;
  }

  async init(): Promise<boolean> {
    if (this.worker) return true;

    return new Promise((resolve) => {
      // Import inlined worker code for maximum compatibility
      // This works with all bundlers without any special configuration
      import("./worker-inline.js")
        .then(({ WORKER_CODE }) => {
          const blob = new Blob([WORKER_CODE], {
            type: "application/javascript",
          });
          const workerUrl = URL.createObjectURL(blob);
          this.worker = new Worker(workerUrl, { type: "module" });
          this.setupWorkerHandlers(resolve);
        })
        .catch(() => {
          // Fallback to file-based worker if inline not available (shouldn't happen in production)
          const workerUrl = new URL("./gpu-worker.js", import.meta.url);
          this.worker = new Worker(workerUrl, { type: "module" });
          this.setupWorkerHandlers(resolve);
        });
    });
  }

  private setupWorkerHandlers(resolve: (value: boolean) => void): void {
    if (!this.worker) return;

    this.worker.onmessage = (e) => {
      const { type, ...data } = e.data;

      switch (type) {
        case "gpu-ready":
          resolve(true);
          break;
        case "error":
          console.error("ChartManager GPU Error:", data.message);
          resolve(false);
          break;
        case "stats":
          this.currentStats = {
            fps: data.fps,
            renderMs: data.renderMs,
            total: data.totalCharts,
            active: data.activeCharts,
          };
          for (const cb of this.statsCallbacks) cb(this.currentStats);
          break;
        case "bounds-update": {
          const chart = this.charts.get(data.id);
          if (chart) {
            chart.bounds = {
              minX: data.minX,
              maxX: data.maxX,
              minY: data.minY,
              maxY: data.maxY,
            };
            this.drawChart(chart);
          }
          break;
        }
        default:
          break;
      }
    };

    this.worker.onerror = (e) => {
      console.error("ChartManager Worker Error:", e);
      resolve(false);
    };

    this.worker.postMessage({ type: "init", isDark: this._isDark });
  }

  create(config: ChartConfig): string {
    if (!this.worker) {
      throw new Error("ChartManager not initialized. Call init() first.");
    }

    const id = `chart-${++this.chartIdCounter}`;

    const el = document.createElement("div");
    el.className = "gpu-chart";
    el.dataset.chartId = id;
    el.style.cssText = "width: 100%; height: 100%; position: relative;";

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "gpu-chart-canvas-wrap";
    canvasWrap.dataset.chartId = id;
    canvasWrap.style.cssText = "width: 100%; height: 100%; position: relative;";

    const backCanvas = document.createElement("canvas");
    backCanvas.className = "gpu-chart-back-canvas";
    backCanvas.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;";

    const gpuCanvas = document.createElement("canvas");
    gpuCanvas.className = "gpu-chart-canvas";
    gpuCanvas.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: auto; z-index: 1;";

    const axisCanvas = document.createElement("canvas");
    axisCanvas.className = "gpu-chart-axis-canvas";
    axisCanvas.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2;";

    canvasWrap.appendChild(backCanvas);
    canvasWrap.appendChild(gpuCanvas);
    canvasWrap.appendChild(axisCanvas);
    el.appendChild(canvasWrap);
    config.container.appendChild(el);

    let offscreen: OffscreenCanvas;
    try {
      offscreen = gpuCanvas.transferControlToOffscreen();
    } catch (e) {
      console.error(
        `ChartManager: Failed to create offscreen canvas for ${id}:`,
        e,
      );
      throw new Error(`Failed to create chart ${id}: ${e}`);
    }

    const rect = canvasWrap.getBoundingClientRect();
    const cssW = rect.width || 400;
    const cssH = rect.height || 200;
    ChartManager.resizeCanvas(offscreen, cssW, cssH);
    ChartManager.resizeCanvas(backCanvas, cssW, cssH);
    ChartManager.resizeCanvas(axisCanvas, cssW, cssH);

    if (config.bgColor) {
      const [r, g, b] = config.bgColor;
      canvasWrap.style.background = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    }

    const chart: InternalChart = {
      id,
      config,
      el,
      backCanvas,
      axisCanvas,
      width: cssW,
      height: cssH,
      series: [],
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      view: { panX: 0, panY: 0, zoomX: 1, zoomY: 1 },
      zoomMode: config.zoomMode || "both",
      visible: true,
      dragging: false,
      bgColor: config.bgColor,
      textColor: config.textColor,
      gridColor: config.gridColor,
      fontFamily: config.fontFamily,
      momentum: null,

      findNearestPoint(screenX, screenY, width, height) {
        if (this.series.length === 0) return null;

        const normX = screenX / width;
        const normY = screenY / height;
        const rangeX = this.bounds.maxX - this.bounds.minX;
        const rangeY = this.bounds.maxY - this.bounds.minY;
        const viewWidth = rangeX / this.view.zoomX;
        const viewHeight = rangeY / this.view.zoomY;
        const viewMinX = this.bounds.minX + this.view.panX * rangeX;
        const viewMinY = this.bounds.minY + this.view.panY * rangeY;
        const dataX = viewMinX + normX * viewWidth;
        const dataY = viewMinY + (1 - normY) * viewHeight;

        let bestSeriesIdx = -1;
        let bestIdx = -1;
        let bestDistX = Infinity;
        let bestDistY = Infinity;

        // Search all series for closest x, then closest y
        for (let s = 0; s < this.series.length; s++) {
          const series = this.series[s];
          const n = series.rawX.length;
          if (n === 0) continue;

          // Binary search for closest x in this series
          let lo = 0,
            hi = n - 1;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (series.rawX[mid] < dataX) lo = mid + 1;
            else hi = mid;
          }

          let idx = lo;
          if (lo > 0) {
            const distLo = Math.abs(series.rawX[lo] - dataX);
            const distPrev = Math.abs(series.rawX[lo - 1] - dataX);
            if (distPrev < distLo) idx = lo - 1;
          }

          const distX = Math.abs(series.rawX[idx] - dataX);
          const distY = Math.abs(series.rawY[idx] - dataY);

          // Prioritize x-axis distance, then y-axis
          if (distX < bestDistX || (distX === bestDistX && distY < bestDistY)) {
            bestDistX = distX;
            bestDistY = distY;
            bestSeriesIdx = s;
            bestIdx = idx;
          }
        }

        if (bestSeriesIdx === -1) return null;

        const series = this.series[bestSeriesIdx];
        const pointNormX = (series.rawX[bestIdx] - viewMinX) / viewWidth;
        const pointScreenX = pointNormX * width;
        const pixelDistX = Math.abs(pointScreenX - screenX);

        if (pixelDistX > ChartManager.HOVER_MAX_DISTANCE_PX) return null;

        return {
          x: series.rawX[bestIdx],
          y: series.rawY[bestIdx],
          index: bestIdx,
          screenX,
          screenY,
          seriesIndex: bestSeriesIdx,
          seriesLabel: series.label,
        };
      },
    };

    this.charts.set(id, chart);

    const workerType = config.type === "bar" ? "box" : config.type;
    this.worker.postMessage(
      {
        type: "register-chart",
        id,
        canvas: offscreen,
        chartType: workerType,
        pointSize: config.pointSize ?? 3,
        maxSamplesPerPixel: config.maxSamplesPerPixel ?? 10000,
        bgColor: config.bgColor ?? null,
      },
      [offscreen],
    );

    this.visibilityObserver.observe(el);
    this.resizeObserver.observe(canvasWrap);

    for (const plugin of globalPlugins) {
      plugin.install?.(chart, canvasWrap);
    }

    this.updateSeries(id, config.series);

    return id;
  }

  destroy(id: string): void {
    const chart = this.charts.get(id);
    if (!chart) return;

    for (const plugin of globalPlugins) {
      plugin.uninstall?.(chart);
    }

    if (chart.momentum) cancelAnimationFrame(chart.momentum);

    this.visibilityObserver.unobserve(chart.el);
    const wrap = chart.el.querySelector(".gpu-chart-canvas-wrap");
    if (wrap) this.resizeObserver.unobserve(wrap);

    chart.el.remove();
    this.worker?.postMessage({ type: "unregister-chart", id });
    this.charts.delete(id);
  }

  updateSeries(id: string, series: ChartSeries[]): void {
    const chart = this.charts.get(id);
    if (!chart || !this.worker) return;
    if (series.length === 0) return;

    // Process each series: sort by x and store
    chart.series = series.map((s) => {
      const n = s.x.length;
      if (n === 0)
        return { label: s.label, color: s.color, rawX: [], rawY: [] };

      const indices = Array.from({ length: n }, (_, i) => i);
      indices.sort((a, b) => s.x[a] - s.x[b]);

      return {
        label: s.label,
        color: s.color,
        rawX: indices.map((i) => s.x[i]),
        rawY: indices.map((i) => s.y[i]),
      };
    });

    // Compute global bounds across all series
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const s of chart.series) {
      for (let i = 0; i < s.rawX.length; i++) {
        if (s.rawX[i] < minX) minX = s.rawX[i];
        if (s.rawX[i] > maxX) maxX = s.rawX[i];
        if (s.rawY[i] < minY) minY = s.rawY[i];
        if (s.rawY[i] > maxY) maxY = s.rawY[i];
      }
    }

    const px = (maxX - minX) * 0.05 || 1;
    const py = (maxY - minY) * 0.1 || 1;
    minX -= px;
    maxX += px;
    minY -= py;
    maxY += py;

    const db = chart.config.defaultBounds;
    if (db) {
      if (db.minX !== undefined) minX = db.minX;
      if (db.maxX !== undefined) maxX = db.maxX;
      if (db.minY !== undefined) minY = db.minY;
      if (db.maxY !== undefined) maxY = db.maxY;
    }

    chart.bounds = { minX, maxX, minY, maxY };

    // Send each series to GPU worker
    const seriesData = chart.series.map((s) => ({
      label: s.label,
      colorR: s.color.r,
      colorG: s.color.g,
      colorB: s.color.b,
      dataX: new Float32Array(s.rawX),
      dataY: new Float32Array(s.rawY),
    }));

    this.worker.postMessage(
      {
        type: "update-series",
        id,
        series: seriesData,
        bounds: chart.bounds,
      },
      seriesData.flatMap((s) => [s.dataX.buffer, s.dataY.buffer]),
    );

    this.sendViewTransform(chart);
    this.drawChart(chart);
  }

  setPointSize(id: string, size: number): void {
    const chart = this.charts.get(id);
    if (!chart) return;
    this.worker?.postMessage({
      type: "set-point-size",
      id,
      pointSize: Math.max(1, Math.min(8, Math.round(size))),
    });
  }

  setMaxSamplesPerPixel(id: string, maxSamples: number): void {
    const chart = this.charts.get(id);
    if (!chart) return;
    this.worker?.postMessage({
      type: "set-max-samples",
      id,
      maxSamplesPerPixel: Math.max(0, maxSamples | 0),
    });
  }

  setStyle(
    id: string,
    style: {
      bgColor?: [number, number, number];
      textColor?: string;
      gridColor?: string;
      fontFamily?: string;
    },
  ): void {
    const chart = this.charts.get(id);
    if (!chart) return;

    if (style.bgColor !== undefined) chart.bgColor = style.bgColor;
    if (style.textColor !== undefined) chart.textColor = style.textColor;
    if (style.gridColor !== undefined) chart.gridColor = style.gridColor;
    if (style.fontFamily !== undefined) chart.fontFamily = style.fontFamily;

    if (style.bgColor !== undefined) {
      const wrap = chart.el.querySelector(
        ".gpu-chart-canvas-wrap",
      ) as HTMLElement;
      if (wrap) {
        const [r, g, b] = style.bgColor;
        wrap.style.background = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      }
      this.worker?.postMessage({
        type: "set-style",
        id,
        bgColor: style.bgColor,
      });
    }

    this.drawChart(chart);
  }

  setZoomMode(id: string, mode: ZoomMode): void {
    const chart = this.charts.get(id);
    if (chart) chart.zoomMode = mode;
  }

  getChartCount(): number {
    return this.charts.size;
  }

  getZoomMode(id: string): ZoomMode {
    return this.charts.get(id)?.zoomMode || "both";
  }

  setSyncViews(sync: boolean): void {
    this._syncViews = sync;
  }

  setTheme(dark: boolean): void {
    this._isDark = dark;
    this.worker?.postMessage({ type: "theme", isDark: dark });
    for (const chart of this.charts.values()) {
      this.drawChart(chart);
    }
  }

  onStats(callback: StatsCallback): () => void {
    this.statsCallbacks.push(callback);
    return () => {
      const idx = this.statsCallbacks.indexOf(callback);
      if (idx >= 0) this.statsCallbacks.splice(idx, 1);
    };
  }

  getStats(): ChartStats {
    return { ...this.currentStats };
  }

  resetView(id: string): void {
    const chart = this.charts.get(id);
    if (!chart) return;

    if (chart.momentum) {
      cancelAnimationFrame(chart.momentum);
      chart.momentum = null;
    }

    const startPanX = chart.view.panX;
    const startPanY = chart.view.panY;
    const startZoomX = chart.view.zoomX;
    const startZoomY = chart.view.zoomY;
    const startTime = performance.now();

    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / 300);
      const ease = 1 - Math.pow(1 - t, 3);

      chart.view.panX = startPanX * (1 - ease);
      chart.view.panY = startPanY * (1 - ease);
      chart.view.zoomX = startZoomX + (1 - startZoomX) * ease;
      chart.view.zoomY = startZoomY + (1 - startZoomY) * ease;

      this.sendViewTransform(chart);
      this.drawChart(chart);

      if (this._syncViews) this.syncAllViews(chart);
      if (t < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  sendViewTransform(chart: InternalChart): void {
    this.worker?.postMessage({
      type: "view-transform",
      id: chart.id,
      panX: chart.view.panX,
      panY: chart.view.panY,
      zoomX: chart.view.zoomX,
      zoomY: chart.view.zoomY,
    });
  }

  syncAllViews(source: InternalChart): void {
    const transforms: { id: string }[] = [];

    for (const chart of this.charts.values()) {
      if (chart.id !== source.id) {
        chart.view = { ...source.view };
        transforms.push({ id: chart.id });
        this.drawChart(chart);
      }
    }

    if (transforms.length > 0) {
      this.worker?.postMessage({
        type: "batch-view-transform",
        panX: source.view.panX,
        panY: source.view.panY,
        zoomX: source.view.zoomX,
        zoomY: source.view.zoomY,
        transforms,
      });
    }
  }

  drawChart(chart: InternalChart): void {
    if (!chart.visible) return;

    const dpr = devicePixelRatio || 1;

    const backCtx = chart.backCanvas.getContext("2d");
    if (backCtx) {
      backCtx.clearRect(0, 0, chart.backCanvas.width, chart.backCanvas.height);
      backCtx.save();
      backCtx.scale(dpr, dpr);
      for (const plugin of globalPlugins) {
        plugin.beforeDraw?.(backCtx, chart);
      }
      backCtx.restore();
    }

    const ctx = chart.axisCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, chart.axisCanvas.width, chart.axisCanvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      for (const plugin of globalPlugins) {
        plugin.afterDraw?.(ctx, chart);
      }
      ctx.restore();
    }
  }
}
