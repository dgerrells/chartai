import type { RendererPlugin } from "../../types.ts";
import { WATERFALL_RENDER_SHADER } from "../../shaders/experimental/waterfall.ts";
import { packRGB } from "../candlestick.ts";

export interface WaterfallConfig {
  upColor?:    [number, number, number];
  downColor?:  [number, number, number];
  totalColor?: [number, number, number];
}

declare module "../types.ts" {
  interface ChartTypeRegistry {
    waterfall: WaterfallConfig;
  }
}

/**
 * Precompute waterfall bar geometry from raw deltas.
 * Returns { x, y, h, t, bw } arrays to pass as series data.
 *
 * @param positions  X positions for each bar (e.g. [0,1,2,...])
 * @param deltas     Y delta values for each bar
 * @param totals     Optional array: 1 = show cumulative total bar, 0 = regular bar
 */
export function prepareWaterfall(
  positions: number[],
  deltas: number[],
  totals?: number[],
): { x: number[]; y: number[]; h: number[]; t: number[]; bw: number[] } {
  const n = deltas.length;
  const y: number[] = new Array(n);
  const h: number[] = new Array(n);
  const t: number[] = new Array(n);
  const bw: number[] = new Array(n);

  let running = 0;
  for (let i = 0; i < n; i++) {
    const isTotal = (totals?.[i] ?? 0) > 0.5;
    const delta = deltas[i];
    if (isTotal) {
      y[i] = Math.min(0, running);
      h[i] = Math.abs(running);
      t[i] = 2;
    } else {
      if (delta >= 0) {
        y[i] = running;
        h[i] = delta;
        t[i] = 0;
      } else {
        y[i] = running + delta;
        h[i] = Math.abs(delta);
        t[i] = 1;
      }
      running += delta;
    }
  }

  for (let i = 0; i < n; i++) {
    let spacing: number;
    if (n <= 1) {
      spacing = 1;
    } else if (i === 0) {
      spacing = positions[1] - positions[0];
    } else if (i === n - 1) {
      spacing = positions[n - 1] - positions[n - 2];
    } else {
      spacing = Math.min(positions[i + 1] - positions[i], positions[i] - positions[i - 1]);
    }
    bw[i] = spacing * 0.8;
  }

  return { x: positions, y, h, t, bw };
}

export const WaterfallChart: RendererPlugin = {
  name: "waterfall",
  shaders: { render: WATERFALL_RENDER_SHADER },
  uniforms: [
    { name: "upColor",    type: "u32", default: packRGB(0.2, 0.7, 0.3) },
    { name: "downColor",  type: "u32", default: packRGB(0.9, 0.3, 0.3) },
    { name: "totalColor", type: "u32", default: packRGB(0.5, 0.5, 0.6) },
  ],
  passes: [
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
      draw: ({ samples }) => Math.max(0, samples * 6),
      bindings: [
        { binding: 0, source: "uniforms" },
        { binding: 1, source: "x-data" },
        { binding: 2, source: "y-data" },
        { binding: 3, source: "custom-uniforms" },
        { binding: 4, source: "h-data" },
        { binding: 5, source: "t-data" },
        { binding: 6, source: "bw-data" },
      ],
    },
  ],

  computeBounds(series) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of series) {
      for (let i = 0; i < s.rawX.length; i++) {
        const x = s.rawX[i];
        const barBottom = s.rawY[i];
        const barHeight = (s.extra["h"] as number[] | undefined)?.[i] ?? 0;
        const barTop = barBottom + barHeight;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (barBottom < minY) minY = barBottom;
        if (barTop > maxY) maxY = barTop;
      }
    }
    if (!isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const px = (maxX - minX) * 0.05 || 1;
    const py = (maxY - minY) * 0.1 || 0.1;
    return { minX: minX - px, maxX: maxX + px, minY: minY - py, maxY: maxY + py };
  },
};
