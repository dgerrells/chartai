import type { RendererPlugin } from "../types.ts";
import { COMPUTE_WG, UNIFORM_STRUCT, BINARY_SEARCH } from "../shaders/shared.ts";
import { LINE_COMPUTE_SHADER, LINE_RENDER_SHADER } from "../shaders/line.ts";

export interface LineConfig {
  pointSize?: number;
  maxSamplesPerPixel?: number;
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    line: LineConfig;
  }
}

export const LineChart: RendererPlugin = {
  name: "line",
  shaders: {
    compute: LINE_COMPUTE_SHADER,
    render: LINE_RENDER_SHADER,
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
      topology: "line-list",
      loadOp: "load",
      blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      },
      // width * 2 vertices per column segment + (width-1) * 2 for connectors = width*4-2
      draw: ({ width }) => Math.max(0, width * 4 - 2),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "lineBuffer" },
        { binding: 2, source: "series-info" },
      ],
    },
  ],
};
