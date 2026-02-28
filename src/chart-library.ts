export type {
  ZoomMode,
  ChartColor,
  ChartSeries,
  HoverData,
  RenderContext,
  BindingDef,
  PassDef,
  BufferDef,
  UniformDef,
  PassMeta,
  RendererPlugin,
  ChartPlugin,
  ChartConfig,
  ChartStats,
  InternalChart,
  BufferUsage,
  BlendFactor,
  BlendOperation,
  BlendComponent,
  BlendState,
} from "./types.ts";

import type {
  ZoomMode,
  ChartColor,
  ChartSeries,
  ChartConfig,
  ChartStats,
  ChartPlugin,
  InternalChart,
  RendererPlugin,
  RenderContext,
  PassMeta,
  ChartTypeRegistry,
  AllPluginOptions,
} from "./types.ts";
import { M } from "./msg.ts";

export class Chart<C extends ChartConfig = ChartConfig> {
  readonly id: string;
  private readonly _mgr: _ChartManager;

  constructor(id: string, mgr: _ChartManager) {
    this.id = id;
    this._mgr = mgr;
  }

  private get _c(): InternalChart<any> | undefined {
    return this._mgr["charts"].get(this.id);
  }

  setData(series: ChartSeries[]): void {
    this._mgr.updateSeries(this.id, series);
  }

  configure(patch: Partial<C>): void {
    const c = this._c;
    if (!c) return;
    Object.assign(c.config, patch);

    // GPU uniforms — any numeric key matching a renderer uniform def or the special pointSize field
    const uniformNames = new Set(
      (c.renderer.uniforms ?? []).map((u) => u.name),
    );
    const workerValues: Record<string, number> = {};
    for (const key of Object.keys(patch)) {
      const val = (patch as Record<string, unknown>)[key];
      if (typeof val === "number" && uniformNames.has(key)) {
        workerValues[key] = val;
      }
    }
    if (Object.keys(workerValues).length > 0) {
      Object.assign(c.customUniforms, workerValues);
      this._mgr["worker"]?.postMessage({
        type: M.SET_UNIFORMS,
        id: this.id,
        values: workerValues,
      });
    }

    if ("hiddenSeries" in patch) {
      this._mgr["worker"]?.postMessage({
        type: M.SET_STYLE,
        id: this.id,
        hiddenSeries: patch.hiddenSeries ?? new Set<number>(),
      });
    }

    if ("bgColor" in patch && patch.bgColor !== undefined) {
      const [r, g, b] = patch.bgColor as [number, number, number];
      const wrap = c.el.querySelector("div") as HTMLElement;
      if (wrap)
        wrap.style.background = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      this._mgr["worker"]?.postMessage({
        type: M.SET_STYLE,
        id: this.id,
        bgColor: patch.bgColor,
      });
    }

    this._mgr.requestRender(this.id);
    this._mgr.drawChart(c);
  }

  addPlugin(plugin: ChartPlugin<any>): void {
    const c = this._c;
    if (!c || c.plugins.some((p) => p.name === plugin.name)) return;
    const wrap = c.el.querySelector("div") as HTMLElement;
    plugin.install?.(c, wrap);
    c.plugins.push(plugin);
    this._mgr.drawChart(c);
  }

  removePlugin(name: string): void {
    const c = this._c;
    if (!c) return;
    const idx = c.plugins.findIndex((p) => p.name === name);
    if (idx >= 0) {
      c.plugins[idx].uninstall?.(c);
      c.plugins.splice(idx, 1);
      this._mgr.drawChart(c);
    }
  }

  hasPlugin(name: string): boolean {
    return this._c?.plugins.some((p) => p.name === name) ?? false;
  }

  resetView(): void {
    this._mgr.resetView(this.id);
  }
  destroy(): void {
    this._mgr.destroy(this.id);
  }
}

let _colorEl: HTMLElement | null = null;
function parseColor(c: ChartColor | string): ChartColor {
  if (typeof c !== "string") return c;
  if (!_colorEl) {
    _colorEl = document.createElement("i");
    _colorEl.style.cssText = "display:none";
    document.body.appendChild(_colorEl);
  }
  _colorEl.style.color = c;
  const m = getComputedStyle(_colorEl).color.match(/\d+/g)!;
  return { r: +m[0] / 255, g: +m[1] / 255, b: +m[2] / 255 };
}

function resizeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  cssW: number,
  cssH: number,
): void {
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  if (canvas instanceof HTMLCanvasElement) {
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }
}

type StatsCallback = (stats: ChartStats) => void;

class _ChartManager {
  private static instance: _ChartManager | null = null;

  private worker: Worker | null = null;
  private charts = new Map<string, InternalChart<any>>();
  private renderers = new Map<string, RendererPlugin>();
  private uiPlugins: ChartPlugin<any>[] = [];
  private pendingRenderers: RendererPlugin[] = [];
  private chartIdCounter = 0;
  private _isDark = false;
  private _syncViews = false;
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
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.chartId;
          if (!id) continue;
          const chart = this.charts.get(id);
          if (!chart) continue;
          chart.visible = e.isIntersecting;
          this.worker?.postMessage({
            type: M.SET_VISIBILITY,
            id,
            visible: e.isIntersecting,
          });
          if (e.isIntersecting) this.drawChart(chart);
        }
      },
      { threshold: 0.01 },
    );

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.chartId;
        if (!id) continue;
        const chart = this.charts.get(id);
        if (!chart) continue;
        const { width, height } = e.contentRect;
        if (width <= 0 || height <= 0) continue;
        chart.width = width;
        chart.height = height;
        const dpr = devicePixelRatio || 1;
        resizeCanvas(chart.backCanvas, width, height);
        resizeCanvas(chart.frontCanvas, width, height);
        const { bufferSizes, perSeriesPassMeta } = this.computeRendererMeta(
          chart.renderer,
          chart,
        );
        this.worker?.postMessage({
          type: M.RESIZE,
          id,
          width: Math.round(width * dpr),
          height: Math.round(height * dpr),
          bufferSizes,
          perSeriesPassMeta,
        });
        this.drawChart(chart);
      }
    });
  }

  static getInstance(): _ChartManager {
    if (!_ChartManager.instance) _ChartManager.instance = new _ChartManager();
    return _ChartManager.instance;
  }

  get isDark(): boolean {
    return this._isDark;
  }
  get syncViews(): boolean {
    return this._syncViews;
  }

  use(plugin: RendererPlugin | ChartPlugin<any>): void {
    if ("passes" in plugin) {
      const r = plugin as RendererPlugin;
      this.renderers.set(r.name, r);
      if (this.worker) this.sendRendererRegistration(r);
      else this.pendingRenderers.push(r);
    } else {
      const p = plugin as ChartPlugin<any>;
      if (!this.uiPlugins.some((x) => x.name === p.name))
        this.uiPlugins.push(p);
    }
  }

  async init(): Promise<boolean> {
    if (this.worker) return true;
    return new Promise((resolve) => {
      import("./worker-inline.js")
        .then(({ WORKER_CODE }) => {
          const blob = new Blob([WORKER_CODE], {
            type: "application/javascript",
          });
          this.worker = new Worker(URL.createObjectURL(blob), {
            type: "module",
          });
          this.setupWorkerHandlers(resolve);
        })
        .catch(() => {
          this.worker = new Worker(
            new URL("./gpu-worker.js", import.meta.url),
            { type: "module" },
          );
          this.setupWorkerHandlers(resolve);
        });
    });
  }

  private setupWorkerHandlers(resolve: (v: boolean) => void): void {
    if (!this.worker) return;
    this.worker.onmessage = (e) => {
      const { type, ...data } = e.data;
      switch (type) {
        case M.GPU_READY:
          for (const r of this.pendingRenderers)
            this.sendRendererRegistration(r);
          this.pendingRenderers = [];
          resolve(true);
          break;
        case M.ERROR:
          console.error("chartai:", data.code);
          resolve(false);
          break;
        case M.STATS:
          this.currentStats = {
            fps: data.fps,
            renderMs: data.renderMs,
            total: data.totalCharts,
            active: data.activeCharts,
          };
          for (const cb of this.statsCallbacks) cb(this.currentStats);
          break;
      }
    };
    this.worker.onerror = (e) => {
      console.error("chartai:", e);
      resolve(false);
    };
    this.worker.postMessage({ type: M.INIT, isDark: this._isDark });
  }

  private sendRendererRegistration(renderer: RendererPlugin): void {
    const bufferDefs = (renderer.buffers ?? []).map((buf) => ({
      name: buf.name,
      usages: buf.usages,
      perSeries: renderer.passes.some(
        (p) =>
          p.perSeries !== false &&
          p.bindings.some((b) => b.source === buf.name),
      ),
    }));
    this.worker?.postMessage({
      type: M.REGISTER_RENDERER,
      name: renderer.name,
      shaders: renderer.shaders,
      passes: renderer.passes.map((p) => ({
        type: p.type,
        shader: p.shader,
        bindings: p.bindings,
        perSeries: p.perSeries !== false,
        topology: p.topology,
        loadOp: p.loadOp,
        blend: p.blend,
      })),
      bufferDefs,
      uniformDefs: renderer.uniforms ?? [],
    });
  }

  private computeRendererMeta(
    renderer: RendererPlugin,
    chart: InternalChart<any>,
  ): {
    bufferSizes: Record<string, number>;
    perSeriesPassMeta: PassMeta[][];
  } {
    const bufferSizes: Record<string, number> = {};
    const perSeriesPassMeta: PassMeta[][] = [];
    const series =
      chart.series.length > 0
        ? chart.series
        : [
            {
              rawX: [] as number[],
              rawY: [] as number[],
              extra: {},
              label: "",
              color: { r: 0, g: 0, b: 0 },
            },
          ];

    // Buffer sizes and dispatch counts must use physical pixels — the worker renders at physical resolution
    const dpr = devicePixelRatio || 1;
    const physW = Math.round(chart.width * dpr);
    const physH = Math.round(chart.height * dpr);

    for (const s of series) {
      const ctx: RenderContext = {
        width: physW,
        height: physH,
        samples: s.rawX.length,
        seriesCount: series.length,
        bounds: chart.bounds,
        view: chart.view,
      };
      for (const buf of renderer.buffers ?? []) {
        const size = buf.bytes(ctx);
        bufferSizes[buf.name] = Math.max(bufferSizes[buf.name] ?? 0, size);
      }
      perSeriesPassMeta.push(
        renderer.passes.map((p) => ({
          dispatch: p.dispatch?.(ctx),
          draw: p.draw?.(ctx),
        })),
      );
    }
    return { bufferSizes, perSeriesPassMeta };
  }

  // Overload 1: type is in the registry → infer renderer config, suggest plugin options
  create<T extends string & keyof ChartTypeRegistry>(
    config: Omit<ChartConfig, "type"> & { type: T } & ChartTypeRegistry[T] &
      AllPluginOptions,
  ): Chart<ChartConfig & ChartTypeRegistry[T] & AllPluginOptions>;
  // Overload 2: unknown/custom type → preserve whatever shape was passed
  create<C extends ChartConfig>(
    config: C & AllPluginOptions,
  ): Chart<C & AllPluginOptions>;
  // Implementation
  create(config: any): Chart<any> {
    if (!this.worker) throw new Error("No worker. Call init().");
    const renderer = this.renderers.get(config.type);
    if (!renderer)
      throw new Error(
        `No renderer "${config.type}". Call manager.use() first.`,
      );

    const id = `chart-${++this.chartIdCounter}`;

    const el = document.createElement("div");
    el.dataset.chartId = id;
    el.style.cssText = "width:100%;height:100%;position:relative;";

    const wrap = document.createElement("div");
    wrap.dataset.chartId = id;
    wrap.style.cssText = "width:100%;height:100%;position:relative;";

    const mkCanvas = (z: number, events: string) => {
      const c = document.createElement("canvas");
      c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:${events};z-index:${z};`;
      return c;
    };
    const backCanvas = mkCanvas(0, "none");
    const gpuCanvas = mkCanvas(1, "auto");
    const frontCanvas = mkCanvas(2, "none");

    wrap.append(backCanvas, gpuCanvas, frontCanvas);
    el.appendChild(wrap);
    config.container.appendChild(el);

    let offscreen: OffscreenCanvas;
    try {
      offscreen = gpuCanvas.transferControlToOffscreen();
    } catch (e) {
      throw new Error(`Failed OffscreenCanvas: ${e}`);
    }

    const rect = wrap.getBoundingClientRect();
    const cssW = rect.width || 400;
    const cssH = rect.height || 200;
    resizeCanvas(offscreen, cssW, cssH);
    resizeCanvas(backCanvas, cssW, cssH);
    resizeCanvas(frontCanvas, cssW, cssH);

    if (config.bgColor) {
      const [r, g, b] = config.bgColor;
      wrap.style.background = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    }

    const customUniforms: Record<string, number> = {};
    for (const u of renderer.uniforms ?? []) {
      const v = (config as Record<string, unknown>)[u.name];
      customUniforms[u.name] = typeof v === "number" ? v : u.default;
    }
    const chart: InternalChart<any> = {
      id,
      config,
      el,
      backCanvas,
      frontCanvas,
      width: cssW,
      height: cssH,
      series: [],
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      view: { panX: 0, panY: 0, zoomX: 1, zoomY: 1 },
      homeView: { panX: 0, panY: 0, zoomX: 1, zoomY: 1 },
      visible: true,
      dragging: false,
      plugins: [...this.uiPlugins],
      renderer,
      customUniforms,
    };

    this.charts.set(id, chart as InternalChart<any>);

    const dpr = devicePixelRatio || 1;
    const { bufferSizes, perSeriesPassMeta } = this.computeRendererMeta(
      renderer,
      chart,
    );
    this.worker.postMessage(
      {
        type: M.REGISTER_CHART,
        id,
        canvas: offscreen,
        rendererName: config.type,
        bgColor: config.bgColor ?? null,
        bufferSizes,
        perSeriesPassMeta,
        customUniformValues: customUniforms,
        width: Math.round(cssW * dpr),
        height: Math.round(cssH * dpr),
      },
      [offscreen],
    );

    this.visibilityObserver.observe(el);
    this.resizeObserver.observe(wrap);

    for (const plugin of chart.plugins) plugin.install?.(chart, wrap);
    renderer.install?.(chart, wrap);

    this.updateSeries(id, config.series);
    return new Chart<any>(id, this);
  }

  destroy(id: string): void {
    const chart = this.charts.get(id);
    if (!chart) return;
    chart.renderer.uninstall?.(chart);
    for (const p of chart.plugins) p.uninstall?.(chart);
    this.visibilityObserver.unobserve(chart.el);
    const wrap = chart.el.querySelector("div");
    if (wrap) this.resizeObserver.unobserve(wrap);
    chart.el.remove();
    this.worker?.postMessage({ type: M.UNREGISTER_CHART, id });
    this.charts.delete(id);
  }

  updateSeries(id: string, series: ChartSeries[]): void {
    const chart = this.charts.get(id);
    if (!chart || !this.worker || series.length === 0) return;

    chart.config.hiddenSeries = series.reduce<Set<number>>((acc, s, i) => {
      if (s.hidden) acc.add(i);
      return acc;
    }, new Set());

    chart.series = series.map((s) => {
      const n = s.x.length;
      const color = parseColor(s.color);
      if (n === 0)
        return { label: s.label, color, rawX: [], rawY: [], extra: {} };
      const idx = Array.from({ length: n }, (_, i) => i).sort(
        (a, b) => s.x[a] - s.x[b],
      );
      const extra: Record<string, number[]> = {};
      for (const key in s) {
        if (
          key !== "label" &&
          key !== "color" &&
          key !== "x" &&
          key !== "y" &&
          Array.isArray(s[key])
        ) {
          extra[key] = idx.map((i) => s[key][i]);
        }
      }
      return {
        label: s.label,
        color,
        rawX: idx.map((i) => s.x[i]),
        rawY: idx.map((i) => s.y[i]),
        extra,
      };
    });

    const customBounds = chart.renderer.computeBounds?.(chart.series);
    let { minX, maxX, minY, maxY } =
      customBounds ??
      (() => {
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
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
        return {
          minX: minX - px,
          maxX: maxX + px,
          minY: minY - py,
          maxY: maxY + py,
        };
      })();

    const db = chart.config.defaultBounds;
    if (db) {
      if (db.minX !== undefined) minX = db.minX;
      if (db.maxX !== undefined) maxX = db.maxX;
      if (db.minY !== undefined) minY = db.minY;
      if (db.maxY !== undefined) maxY = db.maxY;
    }
    chart.bounds = { minX, maxX, minY, maxY };

    const { bufferSizes, perSeriesPassMeta } = this.computeRendererMeta(
      chart.renderer,
      chart,
    );

    const hidden = chart.config.hiddenSeries ?? new Set<number>();
    const seriesData = chart.series.map((s, i) => {
      const extra: Record<string, Float32Array> = {};
      for (const key in s.extra) extra[key] = new Float32Array(s.extra[key]);
      return {
        label: s.label,
        colorR: s.color.r,
        colorG: s.color.g,
        colorB: s.color.b,
        dataX: new Float32Array(s.rawX),
        dataY: new Float32Array(s.rawY),
        extra,
        hidden: hidden.has(i),
      };
    });

    const transferables = seriesData.flatMap((s) => [
      s.dataX.buffer as ArrayBuffer,
      s.dataY.buffer as ArrayBuffer,
      ...Object.values(s.extra).map((a) => a.buffer as ArrayBuffer),
    ]);

    this.worker.postMessage(
      {
        type: M.UPDATE_SERIES,
        id,
        series: seriesData,
        bounds: chart.bounds,
        bufferSizes,
        perSeriesPassMeta,
      },
      transferables,
    );
    this.sendViewTransform(chart);
    this.drawChart(chart);
  }

  setSyncViews(sync: boolean): void {
    this._syncViews = sync;
  }

  setTheme(dark: boolean): void {
    this._isDark = dark;
    this.worker?.postMessage({ type: M.THEME, isDark: dark });
    for (const chart of this.charts.values()) this.drawChart(chart);
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
    for (const p of chart.plugins) p.resetView?.(chart);

    const { panX: spx, panY: spy, zoomX: szx, zoomY: szy } = chart.view;
    const { panX: tpx, panY: tpy, zoomX: tzx, zoomY: tzy } = chart.homeView;
    const t0 = performance.now();

    const animate = () => {
      const t = Math.min(1, (performance.now() - t0) / 300);
      const e = 1 - Math.pow(1 - t, 3);
      chart.view.panX = spx + (tpx - spx) * e;
      chart.view.panY = spy + (tpy - spy) * e;
      chart.view.zoomX = szx + (tzx - szx) * e;
      chart.view.zoomY = szy + (tzy - szy) * e;
      this.sendViewTransform(chart);
      this.drawChart(chart);
      if (this._syncViews) this.syncAllViews(chart);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  setHiddenSeries(id: string, hidden: number[]): void {
    const chart = this.charts.get(id);
    if (!chart) return;
    chart.config.hiddenSeries = new Set(hidden);
    this.worker?.postMessage({
      type: M.SET_STYLE,
      id,
      hiddenSeries: chart.config.hiddenSeries,
    });
    this.drawChart(chart);
  }

  requestRender(id: string): void {
    const chart = this.charts.get(id);
    if (chart) this.sendViewTransform(chart);
  }

  private sendViewTransform(chart: InternalChart<any>): void {
    this.worker?.postMessage({
      type: M.VIEW_TRANSFORM,
      id: chart.id,
      panX: chart.view.panX,
      panY: chart.view.panY,
      zoomX: chart.view.zoomX,
      zoomY: chart.view.zoomY,
    });
  }

  syncAllViews(source: InternalChart<any>): void {
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
        type: M.BATCH_VIEW_TRANSFORM,
        panX: source.view.panX,
        panY: source.view.panY,
        zoomX: source.view.zoomX,
        zoomY: source.view.zoomY,
        transforms,
      });
    }
  }

  drawChart(chart: InternalChart<any>): void {
    if (!chart.visible) return;
    const dpr = devicePixelRatio || 1;
    const backCtx = chart.backCanvas.getContext("2d");
    if (backCtx) {
      backCtx.clearRect(0, 0, chart.backCanvas.width, chart.backCanvas.height);
      backCtx.save();
      backCtx.scale(dpr, dpr);
      for (const p of chart.plugins) p.beforeDraw?.(backCtx, chart);
      backCtx.restore();
    }
    const ctx = chart.frontCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, chart.frontCanvas.width, chart.frontCanvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      for (const p of chart.plugins) p.afterDraw?.(ctx, chart);
      ctx.restore();
    }
  }
}

export const ChartManager = _ChartManager.getInstance();
export type ChartManager = _ChartManager;
