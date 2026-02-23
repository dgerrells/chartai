import type { RendererPlugin } from "../types.ts";
import { COMPUTE_WG } from "../shaders/shared.ts";
import { LINE_COMPUTE_SHADER } from "../shaders/line.ts";
import { AREA_RENDER_SHADER } from "../shaders/area.ts";

export interface AreaConfig {
  maxSamplesPerPixel?: number;
}

export const AreaChart: RendererPlugin = {
  name: "area",
  shaders: {
    compute: LINE_COMPUTE_SHADER,
    render: AREA_RENDER_SHADER,
  },
  uniforms: [
    { name: "maxSamplesPerPixel", type: "u32", default: 10000 },
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
      // Alternating strip: line0, base0, line1, base1, ... — one polygon, no seams
      draw: ({ width }) => Math.max(0, width * 2),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "lineBuffer" },
        { binding: 2, source: "series-info" },
      ],
    },
  ],
};
