import type { RendererPlugin } from "../../types.ts";
import { COMPUTE_WG } from "../../shaders/shared.ts";
import {
  HIST_CLEAR_SHADER,
  HIST_COUNT_SHADER,
  HIST_FIND_MAX_SHADER,
  HIST_RENDER_SHADER,
} from "../../shaders/experimental/histogram.ts";

export interface HistogramConfig {
  binCount?: number;
  minValue?: number;
  maxValue?: number;
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    histogram: HistogramConfig;
  }
}

export const HistogramChart: RendererPlugin = {
  name: "histogram",
  shaders: {
    clear: HIST_CLEAR_SHADER,
    count: HIST_COUNT_SHADER,
    findMax: HIST_FIND_MAX_SHADER,
    render: HIST_RENDER_SHADER,
  },
  uniforms: [
    { name: "binCount", type: "u32", default: 0 },
    { name: "minValue", type: "f32", default: 0 },
    { name: "maxValue", type: "f32", default: 0 },
  ],
  buffers: [
    {
      name: "histBuffer",
      bytes: () => 4096 * 4,
      usages: ["STORAGE"],
    },
    {
      name: "maxBuffer",
      bytes: () => 4,
      usages: ["STORAGE"],
    },
  ],
  passes: [
    {
      type: "compute",
      shader: "clear",
      perSeries: true,
      dispatch: () => ({ x: Math.ceil(4096 / COMPUTE_WG) }),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "histBuffer", write: true },
        { binding: 2, source: "custom-uniforms" },
      ],
    },
    {
      type: "compute",
      shader: "count",
      perSeries: true,
      dispatch: ({ samples }) => ({ x: Math.ceil(Math.max(1, samples) / COMPUTE_WG) }),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "x-data" },
        { binding: 2, source: "histBuffer", write: true },
        { binding: 3, source: "custom-uniforms" },
      ],
    },
    {
      type: "compute",
      shader: "findMax",
      perSeries: true,
      dispatch: () => ({ x: 1 }),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "histBuffer" },
        { binding: 2, source: "maxBuffer", write: true },
        { binding: 3, source: "custom-uniforms" },
      ],
    },
    {
      type: "render",
      shader: "render",
      topology: "triangle-list",
      loadOp: "load",
      blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      },
      perSeries: true,
      draw: () => 4096 * 6,
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "histBuffer" },
        { binding: 2, source: "maxBuffer" },
        { binding: 3, source: "series-info" },
        { binding: 4, source: "series-index" },
        { binding: 5, source: "custom-uniforms" },
      ],
    },
  ],
  computeBounds(series) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const s of series) {
      for (const x of s.rawX) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (!isFinite(minX)) {
      return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    }
    const range = maxX - minX;
    if (range <= 0) {
      return { minX: minX - 0.5, maxX: minX + 0.5, minY: 0, maxY: 1 };
    }
    // The GPU defaults binCount to chart pixel width (~400–800px). Use 512 as
    // a reasonable approximation so the Y scale matches actual bar heights.
    const approxBins = 512;
    const counts = new Int32Array(approxBins);
    for (const s of series) {
      for (const x of s.rawX) {
        const bin = Math.min(approxBins - 1, Math.max(0, Math.floor((x - minX) / range * approxBins)));
        counts[bin]++;
      }
    }
    let maxCount = 0;
    for (let i = 0; i < approxBins; i++) {
      if (counts[i] > maxCount) maxCount = counts[i];
    }
    return { minX, maxX, minY: 0, maxY: Math.max(1, Math.ceil(maxCount * 1.1)) };
  },
};
