import type { RendererPlugin } from "../../types.ts";
import { COMPUTE_WG } from "../../shaders/shared.ts";
import { LINE_COMPUTE_SHADER, STEP_RENDER_SHADER } from "../../shaders/experimental/step.ts";

export interface StepConfig {
  stepMode?: "after" | "before" | "center";
  maxSamplesPerPixel?: number;
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    step: StepConfig;
  }
}

export const StepChart: RendererPlugin = {
  name: "step",
  shaders: {
    compute: LINE_COMPUTE_SHADER,
    render: STEP_RENDER_SHADER,
  },
  uniforms: [
    { name: "maxSamplesPerPixel", type: "u32", default: 10000 },
    { name: "stepMode", type: "u32", default: 0 },
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
      // width*2 vertices for vertical column spans + (width-1)*4 for step connectors (2 segments each)
      draw: ({ width }) => Math.max(0, width * 2 + (width - 1) * 4),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "lineBuffer" },
        { binding: 2, source: "series-info" },
        { binding: 3, source: "custom-uniforms" },
      ],
    },
  ],
};
