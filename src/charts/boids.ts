import type { RendererPlugin } from "../types.ts";
import { ChartManager } from "../chart-library.ts";
import { COMPUTE_WG } from "../shaders/shared.ts";
import {
  BOIDS_INIT_SHADER,
  BOIDS_CLEAR_SHADER,
  BOIDS_INSERT_SHADER,
  BOIDS_SIM_SHADER,
  BOIDS_RENDER_SHADER,
  GRID_W,
  GRID_H,
  MAX_PER_CELL,
} from "../shaders/boids.ts";

export interface BoidsConfig {
  radius?: number;
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    boids: BoidsConfig;
  }
}

const BOID_BYTES = 24; // vec2f pos + vec2f vel + u32 species + u32 pad

const boidsAnimMap = new WeakMap<object, number>();

export const BoidsChart: RendererPlugin = {
  name: "boids",
  shaders: {
    init: BOIDS_INIT_SHADER,
    clear: BOIDS_CLEAR_SHADER,
    insert: BOIDS_INSERT_SHADER,
    sim: BOIDS_SIM_SHADER,
    render: BOIDS_RENDER_SHADER,
  },
  uniforms: [{ name: "radius", type: "f32", default: 6 }],
  buffers: [
    {
      name: "boidsState",
      bytes: ({ samples }) => Math.max(16, samples * BOID_BYTES),
      usages: ["STORAGE"],
    },
    {
      name: "gridCount",
      bytes: () => GRID_W * GRID_H * 4,
      usages: ["STORAGE"],
    },
    {
      name: "gridBoids",
      bytes: () => GRID_W * GRID_H * MAX_PER_CELL * 4,
      usages: ["STORAGE"],
    },
  ],
  passes: [
    // Initialise boid positions/velocities (sentinel: zero vel = uninit)
    {
      type: "compute",
      shader: "init",
      perSeries: true,
      dispatch: ({ samples }) => ({ x: Math.ceil(samples / COMPUTE_WG) }),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "x-data" },
        { binding: 2, source: "y-data" },
        { binding: 3, source: "boidsState", write: true },
        { binding: 4, source: "series-index" },
      ],
    },
    // Clear spatial grid counts to zero
    {
      type: "compute",
      shader: "clear",
      perSeries: true,
      dispatch: () => ({ x: 1 }),
      bindings: [{ binding: 0, source: "gridCount", write: true }],
    },
    // Insert each boid into its grid cell
    {
      type: "compute",
      shader: "insert",
      perSeries: true,
      dispatch: ({ samples }) => ({ x: Math.ceil(samples / COMPUTE_WG) }),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "boidsState" },
        { binding: 2, source: "gridCount", write: true },
        { binding: 3, source: "gridBoids", write: true },
      ],
    },
    // Simulate: 5×5 grid neighbourhood per boid, MAX_PER_CELL cap
    {
      type: "compute",
      shader: "sim",
      perSeries: true,
      dispatch: ({ samples }) => ({ x: Math.ceil(samples / COMPUTE_WG) }),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "boidsState", write: true },
        { binding: 2, source: "series-index" },
        { binding: 3, source: "gridCount" },
        { binding: 4, source: "gridBoids" },
      ],
    },
    // Render: per-boid quads, simple circle SDF
    {
      type: "render",
      shader: "render",
      topology: "triangle-list",
      loadOp: "load",
      perSeries: true,
      blend: {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
      },
      draw: ({ samples }) => samples * 6,
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "boidsState" },
        { binding: 2, source: "series-info" },
        { binding: 3, source: "series-index" },
        { binding: 4, source: "custom-uniforms" },
      ],
    },
  ],

  computeBounds() {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  },

  install(chart, _el) {
    const tick = () => {
      ChartManager.requestRender(chart.id);
      boidsAnimMap.set(chart, requestAnimationFrame(tick));
    };
    boidsAnimMap.set(chart, requestAnimationFrame(tick));
  },

  uninstall(chart) {
    const id = boidsAnimMap.get(chart);
    if (id != null) {
      cancelAnimationFrame(id);
      boidsAnimMap.delete(chart);
    }
  },
};
