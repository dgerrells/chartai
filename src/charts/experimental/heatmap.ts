import type { RendererPlugin } from "../../types.ts";
import { COMPUTE_WG } from "../../shaders/shared.ts";
import { HEATMAP_COMPUTE_SHADER } from "../../shaders/experimental/heatmap.ts";

export interface HeatmapConfig {
  gridColumns: number;
  gridRows: number;
  colorScale?: 0 | 1 | 2 | 3 | "viridis" | "plasma" | "cool" | "warm";
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    heatmap: HeatmapConfig;
  }
}

const MAX_WG_DIM = 65535;

const COLOR_SCALE_MAP: Record<string, number> = { viridis: 0, plasma: 1, cool: 2, warm: 3 };

export const HeatmapChart: RendererPlugin = {
  name: "heatmap",
  shaders: {
    compute: HEATMAP_COMPUTE_SHADER,
  },
  install(chart) {
    const cfg = chart.config as any;
    if (typeof cfg.colorScale === "string") {
      cfg.colorScale = COLOR_SCALE_MAP[cfg.colorScale] ?? 0;
    }
  },
  uniforms: [
    { name: "dispatchXCount", type: "u32", default: 1 },
    { name: "gridColumns", type: "u32", default: 1 },
    { name: "gridRows", type: "u32", default: 1 },
    { name: "colorScale", type: "u32", default: 0 },
  ],
  passes: [
    {
      type: "compute",
      shader: "compute",
      perSeries: true,
      dispatch: ({ samples }) => {
        const totalWG = Math.ceil(Math.max(1, samples) / COMPUTE_WG);
        const wgX = Math.min(totalWG, MAX_WG_DIM);
        const wgY = Math.ceil(totalWG / MAX_WG_DIM);
        return { x: wgX, y: wgY, xCount: wgX * COMPUTE_WG };
      },
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "x-data" },
        { binding: 2, source: "y-data" },
        { binding: 3, source: "render-target", write: true },
        { binding: 4, source: "series-info" },
        { binding: 5, source: "series-index" },
        { binding: 6, source: "custom-uniforms" },
        { binding: 7, source: "value-data" },
      ],
    },
  ],
  computeBounds(series) {
    let maxCol = 0;
    let maxRow = 0;
    for (const s of series) {
      for (const x of s.rawX) if (x > maxCol) maxCol = x;
      for (const y of s.rawY) if (y > maxRow) maxRow = y;
    }
    return { minX: -0.5, maxX: maxCol + 0.5, minY: -0.5, maxY: maxRow + 0.5 };
  },
};
