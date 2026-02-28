import type { RendererPlugin } from "../../types.ts";
import { COMPUTE_WG } from "../../shaders/shared.ts";
import { BUBBLE_COMPUTE_SHADER } from "../../shaders/experimental/bubble.ts";

export interface BubbleConfig {
  maxPointSize?: number;
  minPointSize?: number;
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    bubble: BubbleConfig;
  }
}

const MAX_WG_DIM = 65535;

export const BubbleChart: RendererPlugin = {
  name: "bubble",
  shaders: {
    compute: BUBBLE_COMPUTE_SHADER,
  },
  uniforms: [
    { name: "dispatchXCount", type: "u32", default: 1 },
    { name: "maxPointSize", type: "f32", default: 40 },
    { name: "minPointSize", type: "f32", default: 2 },
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
        { binding: 7, source: "r-data" },
      ],
    },
  ],
};
