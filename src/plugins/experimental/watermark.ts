import type { ChartPlugin } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { MARGIN } from "../shared.ts";
import { DEFAULT_FONT } from "../labels.ts";

export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface WatermarkConfig {
  watermarkText?: string;
  watermarkPosition?: WatermarkPosition;
  watermarkOpacity?: number;
  watermarkFontSize?: number;
  watermarkColor?: string;
  watermarkRotation?: number;
  fontFamily?: string;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    watermark: WatermarkConfig;
  }
}

export const watermarkPlugin: ChartPlugin<WatermarkConfig> = {
  name: "watermark",

  beforeDraw(ctx, chart) {
    const cfg = chart.config as any;
    const text: string | undefined = cfg.watermarkText;
    if (!text) return;

    const { width: w, height: h } = chart;
    const m = MARGIN;
    const chartW = w - m.left - m.right;
    const chartH = h - m.top - m.bottom;
    const position: WatermarkPosition = cfg.watermarkPosition ?? "center";
    const opacity: number = cfg.watermarkOpacity ?? 0.07;
    const fontSize: number =
      cfg.watermarkFontSize ??
      Math.max(12, Math.round(Math.min(chartW, chartH) * 0.06));
    const dark = ChartManager.isDark;
    const color: string = cfg.watermarkColor ?? (dark ? "#ffffff" : "#000000");
    const fontFamily: string = cfg.fontFamily ?? DEFAULT_FONT;
    const rotation: number =
      cfg.watermarkRotation ?? (position === "center" ? -30 : 0);
    const pad = 16;

    let x: number;
    let y: number;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";

    switch (position) {
      case "center":
        x = m.left + chartW / 2;
        y = m.top + chartH / 2;
        ctx.textAlign = "center";
        break;
      case "top-left":
        x = m.left + pad;
        y = m.top + pad + fontSize / 2;
        ctx.textAlign = "left";
        break;
      case "top-right":
        x = w - m.right - pad;
        y = m.top + pad + fontSize / 2;
        ctx.textAlign = "right";
        break;
      case "bottom-left":
        x = m.left + pad;
        y = h - m.bottom - pad - fontSize / 2;
        ctx.textAlign = "left";
        break;
      case "bottom-right":
        x = w - m.right - pad;
        y = h - m.bottom - pad - fontSize / 2;
        ctx.textAlign = "right";
        break;
    }

    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  },
};
