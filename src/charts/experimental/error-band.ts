import type { RendererPlugin } from "../../types.ts";
import { COMPUTE_WG } from "../../shaders/shared.ts";
import {
  ERROR_BAND_COMPUTE_SHADER,
  ERROR_BAND_FILL_RENDER_SHADER,
  ERROR_BAND_LINE_RENDER_SHADER,
} from "../../shaders/experimental/error-band.ts";

export interface ErrorBandConfig {
  bandOpacity?: number;
  maxSamplesPerPixel?: number;
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    "error-band": ErrorBandConfig;
  }
}

export const ErrorBandChart: RendererPlugin = {
  name: "error-band",
  shaders: {
    compute: ERROR_BAND_COMPUTE_SHADER,
    fill: ERROR_BAND_FILL_RENDER_SHADER,
    line: ERROR_BAND_LINE_RENDER_SHADER,
  },
  uniforms: [
    { name: "maxSamplesPerPixel", type: "u32", default: 10000 },
    { name: "bandOpacity",        type: "f32", default: 0.25 },
  ],
  buffers: [
    {
      name: "bandBuffer",
      bytes: ({ width }) => Math.max(16, width * 5 * 4),
      usages: ["STORAGE"],
    },
  ],
  passes: [
    {
      type: "compute",
      shader: "compute",
      perSeries: true,
      dispatch: ({ width }) => ({ x: Math.ceil(Math.max(1, width) / COMPUTE_WG) }),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "x-data" },
        { binding: 2, source: "y-data" },
        { binding: 3, source: "bandBuffer", write: true },
        { binding: 4, source: "series-info" },
        { binding: 5, source: "custom-uniforms" },
        { binding: 6, source: "lo-data" },
        { binding: 7, source: "hi-data" },
      ],
    },
    {
      type: "render",
      shader: "fill",
      topology: "triangle-strip",
      loadOp: "load",
      blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      },
      draw: ({ width }) => Math.max(0, width * 2),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "bandBuffer" },
        { binding: 2, source: "series-info" },
        { binding: 3, source: "custom-uniforms" },
      ],
    },
    {
      type: "render",
      shader: "line",
      topology: "line-list",
      loadOp: "load",
      draw: ({ width }) => Math.max(0, (width - 1) * 2),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "bandBuffer" },
        { binding: 2, source: "series-info" },
      ],
    },
  ],

  computeBounds(series) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of series) {
      for (const x of s.rawX) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      for (const y of (s.extra.hi ?? [])) { if (y > maxY) maxY = y; }
      for (const y of (s.extra.lo ?? [])) { if (y < minY) minY = y; }
      for (const y of s.rawY) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const py = (maxY - minY) * 0.1 || 1;
    return { minX, maxX, minY: minY - py, maxY: maxY + py };
  },
};
