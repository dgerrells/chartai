import type { RendererPlugin } from "../../types.ts";
import { COMPUTE_WG } from "../../shaders/shared.ts";
import { BASELINE_AREA_COMPUTE_SHADER, BASELINE_AREA_RENDER_SHADER } from "../../shaders/experimental/baseline-area.ts";

export interface BaselineAreaConfig {
  baseline?: number;
  positiveColor?: [number, number, number];
  negativeColor?: [number, number, number];
  maxSamplesPerPixel?: number;
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    "baseline-area": BaselineAreaConfig;
  }
}

const packRGB = (r: number, g: number, b: number): number =>
  ((Math.round(r * 255) & 0xFF) |
   ((Math.round(g * 255) & 0xFF) << 8) |
   ((Math.round(b * 255) & 0xFF) << 16) |
   (0xFF << 24)) >>> 0;

export const BaselineAreaChart: RendererPlugin = {
  name: "baseline-area",
  shaders: {
    compute: BASELINE_AREA_COMPUTE_SHADER,
    render: BASELINE_AREA_RENDER_SHADER,
  },
  uniforms: [
    { name: "maxSamplesPerPixel", type: "u32", default: 10000 },
    { name: "baseline",           type: "f32", default: 0 },
    { name: "positiveColor",      type: "u32", default: packRGB(0.2, 0.7, 0.4) },
    { name: "negativeColor",      type: "u32", default: packRGB(0.9, 0.3, 0.25) },
  ],
  buffers: [
    {
      name: "lineBuffer",
      bytes: ({ width }) => Math.max(16, width * 4 * 4),
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
        { binding: 3, source: "lineBuffer", write: true },
        { binding: 4, source: "series-info" },
        { binding: 5, source: "custom-uniforms" },
      ],
    },
    {
      type: "render",
      shader: "render",
      topology: "triangle-strip",
      loadOp: "load",
      blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      },
      draw: ({ width }) => Math.max(0, width * 2),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "lineBuffer" },
        { binding: 2, source: "series-info" },
        { binding: 3, source: "custom-uniforms" },
      ],
    },
  ],
};
