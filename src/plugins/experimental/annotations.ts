import type { ChartPlugin } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { MARGIN } from "../shared.ts";
import { DEFAULT_FONT } from "../labels.ts";
import { dataToScreen } from "../coords.ts";

export type AnnotationType = "hline" | "vline" | "hregion" | "vregion";

export interface Annotation {
  type: AnnotationType;
  value: number;
  value2?: number;
  label?: string;
  color?: string;
  dash?: [number, number];
  lineWidth?: number;
}

export interface AnnotationsConfig {
  annotations?: Annotation[];
  fontFamily?: string;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    annotations: AnnotationsConfig;
  }
}

const DEFAULT_COLOR = "rgba(100,100,200,0.8)";

function drawPill(
  ctx: CanvasRenderingContext2D,
  txt: string,
  cx: number,
  cy: number,
  color: string,
  dark: boolean,
  fontFamily: string,
) {
  ctx.font = `600 10px ${fontFamily}`;
  const tw = ctx.measureText(txt).width;
  const pw = tw + 12;
  const ph = 18;
  const px = cx - pw / 2;
  const py = cy - ph / 2;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 4);
  ctx.fillStyle = dark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt, cx, cy);
}

export const annotationsPlugin: ChartPlugin<AnnotationsConfig> = {
  name: "annotations",

  beforeDraw(ctx, chart) {
    const annotations: Annotation[] = (chart.config as any).annotations ?? [];
    const { width: w, height: h } = chart;
    const m = MARGIN;
    const dark = ChartManager.isDark;
    const fontFamily: string =
      (chart.config as any).fontFamily ?? DEFAULT_FONT;

    const regions = annotations.filter(
      (a) => a.type === "hregion" || a.type === "vregion",
    );
    if (regions.length === 0) return;

    ctx.save();

    // Pass 1: clipped — draw region fills
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.left, m.top, w - m.left - m.right, h - m.top - m.bottom);
    ctx.clip();

    for (const ann of regions) {
      const color =
        ann.color ?? (dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)");
      const { y: sy1 } = dataToScreen(0, ann.value, chart, w, h);
      const { x: sx1 } = dataToScreen(ann.value, 0, chart, w, h);
      const v2 = ann.value2 ?? ann.value;
      const { y: sy2 } = dataToScreen(0, v2, chart, w, h);
      const { x: sx2 } = dataToScreen(v2, 0, chart, w, h);

      ctx.fillStyle = color;
      if (ann.type === "hregion") {
        const top = Math.min(sy1, sy2);
        const bottom = Math.max(sy1, sy2);
        ctx.fillRect(m.left, top, w - m.left - m.right, bottom - top);
      } else {
        const left = Math.min(sx1, sx2);
        const right = Math.max(sx1, sx2);
        ctx.fillRect(left, m.top, right - left, h - m.top - m.bottom);
      }
    }

    ctx.restore();

    // Pass 2: unclipped — draw region labels
    for (const ann of regions) {
      if (!ann.label) continue;
      const color =
        ann.color ?? (dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)");
      const { y: sy1 } = dataToScreen(0, ann.value, chart, w, h);
      const { x: sx1 } = dataToScreen(ann.value, 0, chart, w, h);
      const v2 = ann.value2 ?? ann.value;
      const { y: sy2 } = dataToScreen(0, v2, chart, w, h);
      const { x: sx2 } = dataToScreen(v2, 0, chart, w, h);

      if (ann.type === "hregion") {
        // Right edge, vertically centered between sy1 and sy2
        const cy = (sy1 + sy2) / 2;
        if (cy < m.top - 9 || cy > h - m.bottom + 9) continue;
        ctx.font = `600 10px ${fontFamily}`;
        const pw = ctx.measureText(ann.label).width + 12;
        const cx = w - m.right - pw / 2 - 4;
        drawPill(ctx, ann.label, cx, cy, color, dark, fontFamily);
      } else {
        // Bottom margin, horizontally centered between sx1 and sx2
        ctx.font = `600 10px ${fontFamily}`;
        const tw = ctx.measureText(ann.label).width;
        const pw = tw + 12;
        const cx = (sx1 + sx2) / 2;
        if (cx < m.left - (pw / 2 + 2) || cx > w - m.right + (pw / 2 + 2)) continue;
        const cy = h - m.bottom / 2;
        drawPill(ctx, ann.label, cx, cy, color, dark, fontFamily);
      }
    }

    ctx.restore();
  },

  afterDraw(ctx, chart) {
    const annotations: Annotation[] = (chart.config as any).annotations ?? [];
    const { width: w, height: h } = chart;
    const m = MARGIN;
    const dark = ChartManager.isDark;
    const fontFamily: string =
      (chart.config as any).fontFamily ?? DEFAULT_FONT;

    const lines = annotations.filter(
      (a) => a.type === "hline" || a.type === "vline",
    );
    if (lines.length === 0) return;

    ctx.save();

    // Pass 1: clipped — draw lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.left, m.top, w - m.left - m.right, h - m.top - m.bottom);
    ctx.clip();

    for (const ann of lines) {
      const color = ann.color ?? DEFAULT_COLOR;
      ctx.strokeStyle = color;
      ctx.lineWidth = ann.lineWidth ?? 1.5;
      ctx.setLineDash(ann.dash ?? []);
      ctx.beginPath();

      if (ann.type === "hline") {
        const { y: sy } = dataToScreen(0, ann.value, chart, w, h);
        ctx.moveTo(m.left, sy);
        ctx.lineTo(w - m.right, sy);
      } else {
        const { x: sx } = dataToScreen(ann.value, 0, chart, w, h);
        ctx.moveTo(sx, m.top);
        ctx.lineTo(sx, h - m.bottom);
      }

      ctx.stroke();
    }

    ctx.restore();

    // Pass 2: unclipped — draw line labels
    for (const ann of lines) {
      if (!ann.label) continue;
      const color = ann.color ?? DEFAULT_COLOR;

      if (ann.type === "hline") {
        const { y: sy } = dataToScreen(0, ann.value, chart, w, h);
        if (sy < m.top - 9 || sy > h - m.bottom + 9) continue;
        // Pill inside right margin, centered on the line
        ctx.font = `600 10px ${fontFamily}`;
        const tw = ctx.measureText(ann.label).width;
        const pw = tw + 12;
        const cx = w - m.right - pw / 2 - 4;
        drawPill(ctx, ann.label, cx, sy, color, dark, fontFamily);
      } else {
        const { x: sx } = dataToScreen(ann.value, 0, chart, w, h);
        // Pill inside bottom margin, centered on the line
        ctx.font = `600 10px ${fontFamily}`;
        const tw = ctx.measureText(ann.label).width;
        const pw = tw + 12;
        if (sx < m.left - (pw / 2 + 2) || sx > w - m.right + (pw / 2 + 2)) continue;
        const cy = h - m.bottom / 2;
        drawPill(ctx, ann.label, sx, cy, color, dark, fontFamily);
      }
    }

    ctx.restore();
  },
};
