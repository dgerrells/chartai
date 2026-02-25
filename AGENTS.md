# chartai — Agent Reference

Guide for LLM agents working with the chartai charting library.

## Overview

chartai is a GPU-accelerated charting library that renders via WebGPU compute and render pipelines in a web worker. The main thread stays free; charts update passively when needed.

**Architecture:**
- **Main thread:** ChartManager singleton, Chart instances, DOM/canvas setup, plugin UI
- **Web worker:** GPU worker (`gpu-worker.ts`) runs compute shaders and render passes
- **Triple canvas:** back (2D, behind chart), GPU (OffscreenCanvas), front (2D, overlays)
- **Plugins:** Two kinds — **RendererPlugin** (GPU chart types) and **ChartPlugin** (UI: zoom, hover, labels)

**Requirements:** WebGPU with compute shader support. No fallback.

---

## Core API

### ChartManager (singleton)

```ts
import { ChartManager } from 'chartai';
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `use` | `(plugin: RendererPlugin \| ChartPlugin) => void` | Register a chart type or UI plugin. Call before `init()`. |
| `init` | `() => Promise<boolean>` | Start GPU worker. Returns `true` if WebGPU is available. |
| `create` | `(config: ChartConfig & ...) => Chart` | Create a chart. Requires `init()` first and a matching renderer via `use()`. |
| `setTheme` | `(dark: boolean) => void` | Toggle dark mode. |
| `setSyncViews` | `(sync: boolean) => void` | Sync pan/zoom across all charts. |
| `onStats` | `(cb: (stats: ChartStats) => void) => () => void` | Subscribe to FPS/render stats. Returns unsubscribe. |
| `getStats` | `() => ChartStats` | Current stats snapshot. |

### Chart (instance)

Returned by `ChartManager.create()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `id` | `string` | Chart ID (readonly). |
| `setData` | `(series: ChartSeries[]) => void` | Replace all series data. |
| `configure` | `(patch: Partial<Config>) => void` | Update config, uniforms, bgColor. Triggers render. |
| `addPlugin` | `(plugin: ChartPlugin) => void` | Add UI plugin to this chart only. |
| `removePlugin` | `(name: string) => void` | Remove plugin by name. |
| `hasPlugin` | `(name: string) => boolean` | Check if plugin is installed. |
| `resetView` | `() => void` | Animate back to default pan/zoom. |
| `destroy` | `() => void` | Remove chart and cleanup. |

---

## API with Defaults

### ChartConfig (base, required)

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `string` | yes | — |
| `container` | `HTMLElement` | yes | — |
| `series` | `ChartSeries[]` | yes | — |
| `defaultBounds` | `{ minX?, maxX?, minY?, maxY? }` | no | auto from data |
| `bgColor` | `[r, g, b]` 0–1 | no | theme-based |

### ChartSeries

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `label` | `string` | yes | — |
| `color` | `ChartColor \| string` | yes | `{ r, g, b }` 0–1 or any CSS color (hex, rgb, oklab, etc.) |
| `x` | `number[]` | yes | Sorted by X before upload |
| `y` | `number[]` | yes | Same length as `x` |
| `[key]` | `number[]` | no | Extra per-point data; use in shaders via `{key}-data` binding |

### Built-in chart types and their config

| Type | Config | Defaults |
|------|--------|----------|
| `line` | `LineConfig` | `maxSamplesPerPixel: 10000` |
| `area` | same as line | same |
| `scatter` | `ScatterConfig` | `pointSize: 3` |
| `bar` | `BarConfig` | `maxSamplesPerPixel: 10000` |
| `candlestick` | `CandlestickConfig` | `maxSamples: 10000`, `binSize: 8`, `interval: 0`, `upColor`, `downColor` |
| `boids` | `BoidsConfig` | `radius: 6` |

### Plugin options (merged into create config)

| Plugin | Config | Defaults |
|--------|--------|----------|
| zoom | `zoomMode?: ZoomMode` | `"both"` |
| hover | `showTooltip?: boolean`, `onHover?: (HoverData \| null) => void`, `pillDecayMs?: number`, `formatX?`, `formatY?`, `fontFamily?` | `showTooltip: false`, `pillDecayMs: 60` |
| labels | `textColor?`, `gridColor?`, `fontFamily?`, `labelSize?`, `formatX?`, `formatY?` | theme-based colors, `formatX/Y: String` |

`ZoomMode`: `"both"` | `"x-only"` | `"y-only"` | `"none"`

---

## Custom Charts (RendererPlugin)

A custom chart is a `RendererPlugin` with WGSL shaders. Register with `ChartManager.use(MyChart)` before `create()`.

### RendererPlugin

```ts
interface RendererPlugin {
  name: string;                    // Used as config.type
  shaders: Record<string, string>; // Named WGSL entry points
  passes: PassDef[];
  buffers?: BufferDef[];
  uniforms?: UniformDef[];
  computeBounds?: (series) => { minX, maxX, minY, maxY };
  install?: (chart, el) => void;
  uninstall?: (chart) => void;
}
```

### PassDef

```ts
interface PassDef {
  type: "compute" | "render";
  shader: string;           // Key in shaders map
  bindings: BindingDef[];
  perSeries?: boolean;      // Default true for compute
  dispatch?: (ctx: RenderContext) => { x, y?, z? };  // Compute only
  topology?: string;        // Render: "triangle-list" | "line-list" | etc.
  loadOp?: "clear" | "load";
  blend?: BlendState;
  draw?: (ctx: RenderContext) => number;  // Render: vertex count
}
```

### BindingDef

```ts
interface BindingDef {
  binding: number;
  source: string;   // Built-in or buffer name
  write?: boolean;  // For storage buffers
}
```

### Built-in binding sources

| Source | Description |
|--------|-------------|
| `uniforms` | View + theme uniforms (width, height, viewMinX/Y, viewMaxX/Y, bounds, isDark, bgColor, etc.) |
| `custom-uniforms` | Renderer uniforms (from config / `chart.configure()`) |
| `series-info` | Per-series color + visible range (SeriesInfo struct) |
| `series-index` | Current series index (perSeries passes) |
| `x-data` | Float32Array of X values |
| `y-data` | Float32Array of Y values |
| `{key}-data` | Extra series data: `series.extra[key]` → e.g. `open-data`, `high-data`, `low-data` |
| `render-target` | Output texture (compute, write-only) |
| `{bufferName}` | Custom buffer from `buffers` |

### BufferDef

```ts
interface BufferDef {
  name: string;
  bytes: (ctx: RenderContext) => number;
  usages: BufferUsage[];  // e.g. ["STORAGE"]
}
```

If a pass uses a buffer and `perSeries` is true, the worker creates one buffer per series. Otherwise one per chart.

### UniformDef

```ts
interface UniformDef {
  name: string;
  type: "f32" | "u32";
  default: number;
}
```

Values come from `create()` config and `chart.configure()`. Use `custom-uniforms` binding in shaders.

### RenderContext (for dispatch, draw, bytes)

```ts
interface RenderContext {
  width: number;   // Physical pixels
  height: number;
  samples: number; // Points in current series
  seriesCount: number;
  bounds: { minX, maxX, minY, maxY };
  view: { panX, panY, zoomX, zoomY };
}
```

### Shader conventions

- Include shared structs from `shaders/shared.ts`: `UNIFORM_STRUCT`, `BINARY_SEARCH`, `COMPUTE_WG`
- Compute: `@compute @workgroup_size(COMPUTE_WG)` or similar
- Render: `@vertex` and `@fragment` entry points
- Bindings use `@group(0) @binding(N)` — group is always 0
- `uniforms` layout: `Uniforms`, `SeriesInfo`, `SeriesIndex` as documented in shared.ts

### Example: minimal custom renderer

```ts
import type { RendererPlugin } from "chartai/types";

const MY_SHADER = `/* WGSL */`;

export const MyChart: RendererPlugin = {
  name: "my-chart",
  shaders: { main: MY_SHADER },
  uniforms: [{ name: "pointSize", type: "f32", default: 4 }],
  buffers: [{
    name: "outBuffer",
    bytes: ({ width }) => width * 16,
    usages: ["STORAGE"],
  }],
  passes: [{
    type: "compute",
    shader: "main",
    perSeries: true,
    dispatch: ({ samples }) => ({ x: Math.ceil(samples / 256) }),
    bindings: [
      { binding: 0, source: "uniforms" },
      { binding: 1, source: "x-data" },
      { binding: 2, source: "y-data" },
      { binding: 3, source: "outBuffer", write: true },
      { binding: 4, source: "series-info" },
      { binding: 5, source: "custom-uniforms" },
    ],
  }],
};
```

---

## Custom Plugins (ChartPlugin)

UI plugins draw on the back/front canvases and attach event handlers.

```ts
interface ChartPlugin<C = object> {
  name: string;
  install?: (chart: InternalChart, el: HTMLElement) => void;
  uninstall?: (chart: InternalChart) => void;
  resetView?: (chart: InternalChart) => void;
  beforeDraw?: (ctx: CanvasRenderingContext2D, chart: InternalChart) => void;
  afterDraw?: (ctx: CanvasRenderingContext2D, chart: InternalChart) => void;
}
```

- `beforeDraw`: runs on back canvas, behind GPU chart
- `afterDraw`: runs on front canvas, on top
- Use `chart.config` for plugin options; extend `ChartPluginRegistry` in types for typing
- Use `ChartManager.drawChart(chart)` to request a redraw after state changes

---

## Package exports

| Export | Contents |
|--------|----------|
| `chartai` | ChartManager, Chart, types |
| `chartai/types` | ChartSeries, ChartConfig, RendererPlugin, ChartPlugin, etc. |
| `chartai/charts/line` | LineChart |
| `chartai/charts/area` | AreaChart |
| `chartai/charts/scatter` | ScatterChart |
| `chartai/charts/bar` | BarChart |
| `chartai/charts/candlestick` | CandlestickChart |
| `chartai/plugins/zoom` | zoomPlugin() |
| `chartai/plugins/hover` | hoverPlugin |
| `chartai/plugins/labels` | labelsPlugin |
| `chartai/plugins/legend` | legendPlugin |
