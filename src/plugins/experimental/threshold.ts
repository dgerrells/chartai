import type { ChartPlugin, ChartConfig, InternalChart } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { MARGIN } from "../shared.ts";
import { DEFAULT_FONT } from "../labels.ts";
import { dataToScreen } from "../coords.ts";

export interface Threshold {
  y: number;
  label?: string;
  color: string;
  fillAbove?: string;
  fillBelow?: string;
  lineWidth?: number;
  dash?: [number, number];
}

export interface ThresholdConfig {
  thresholds?: Threshold[];
  fontFamily?: string;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    threshold: ThresholdConfig;
  }
}

export const thresholdPlugin: ChartPlugin<ThresholdConfig> = {
  name: "threshold",

  beforeDraw(ctx, chart) {
    const cfg = chart.config as ChartConfig & ThresholdConfig;
    const thresholds = cfg.thresholds;
    if (!thresholds?.length) return;

    const w = chart.width;
    const h = chart.height;
    const m = MARGIN;

    for (const threshold of thresholds) {
      if (!threshold.fillAbove && !threshold.fillBelow) continue;

      const sy = dataToScreen(0, threshold.y, chart, w, h).y;

      ctx.save();
      ctx.beginPath();
      ctx.rect(m.left, m.top, w - m.left - m.right, h - m.top - m.bottom);
      ctx.clip();

      if (threshold.fillAbove) {
        ctx.fillStyle = threshold.fillAbove;
        ctx.fillRect(m.left, m.top, w - m.left - m.right, sy - m.top);
      }

      if (threshold.fillBelow) {
        ctx.fillStyle = threshold.fillBelow;
        ctx.fillRect(m.left, sy, w - m.left - m.right, h - m.bottom - sy);
      }

      ctx.restore();
    }
  },

  afterDraw(ctx, chart) {
    const cfg = chart.config as ChartConfig & ThresholdConfig;
    const thresholds = cfg.thresholds;
    if (!thresholds?.length) return;

    const w = chart.width;
    const h = chart.height;
    const m = MARGIN;
    const dark = ChartManager.isDark;
    const fontFamily = cfg.fontFamily ?? DEFAULT_FONT;

    for (const threshold of thresholds) {
      const sy = dataToScreen(0, threshold.y, chart, w, h).y;

      if (sy < m.top || sy > h - m.bottom) continue;

      ctx.save();
      ctx.strokeStyle = threshold.color;
      ctx.lineWidth = threshold.lineWidth ?? 1.5;
      ctx.setLineDash(threshold.dash ?? [5, 3]);
      ctx.beginPath();
      ctx.moveTo(m.left, sy);
      ctx.lineTo(w - m.right, sy);
      ctx.stroke();
      ctx.restore();

      if (threshold.label) {
        ctx.save();
        ctx.font = `600 10px ${fontFamily}`;
        const tw = ctx.measureText(threshold.label).width;
        const pw = tw + 10;
        const ph = 17;
        const px = w - m.right - pw - 4;
        const py = sy - ph / 2;

        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, 3);
        ctx.fillStyle = dark ? "rgba(20,20,22,0.88)" : "rgba(255,255,255,0.92)";
        ctx.fill();
        ctx.strokeStyle = threshold.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();

        ctx.fillStyle = threshold.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(threshold.label, px + 5, sy);
        ctx.restore();
      }
    }
  },
};
