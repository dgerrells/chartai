import type { ChartPlugin, InternalChart } from "../chart-library.ts";
import { ChartManager } from "../chart-library.ts";

const niceTicks = (min: number, max: number, count: number) => {
  const range = max - min;
  if (range <= 0) return [min];
  const rough = range / count,
    mag = 10 ** Math.floor(Math.log10(rough)),
    res = rough / mag;
  const step = mag * (res <= 1.5 ? 1 : res <= 3 ? 2 : res <= 7 ? 5 : 10);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
};

const getViewState = (chart: InternalChart) => {
  const mgr = ChartManager.getInstance(),
    w = chart.width,
    h = chart.height,
    m = ChartManager.MARGIN;
  const { bounds: b, view: v } = chart,
    fullX = b.maxX - b.minX,
    fullY = b.maxY - b.minY;
  const rx = fullX / v.zoomX,
    ry = fullY / v.zoomY;
  const mx = b.minX + v.panX * fullX,
    my = b.minY + v.panY * fullY;
  const bgc =
    chart.bgColor ?? (mgr.isDark ? [0.11, 0.11, 0.12] : [0.98, 0.98, 0.98]);
  return {
    w,
    h,
    m,
    rx,
    ry,
    mx,
    my,
    bg: `${Math.round(bgc[0] * 255)},${Math.round(bgc[1] * 255)},${Math.round(bgc[2] * 255)}`,
    font: chart.fontFamily ?? ChartManager.DEFAULT_FONT,
    text: chart.textColor ?? (mgr.isDark ? "#c0c0c0" : "#333333"),
    grid:
      chart.gridColor ??
      (mgr.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"),
  };
};

export const labelsPlugin: ChartPlugin = {
  name: "labels",

  beforeDraw(ctx, chart) {
    const { w, h, m, rx, ry, mx, my, grid } = getViewState(chart);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();

    niceTicks(my, my + ry, 7).forEach((v) => {
      const y = h * (1 - (v - my) / ry);
      if (y > 5 && y < h - m.bottom - 5) {
        ctx.moveTo(m.left, y);
        ctx.lineTo(w, y);
      }
    });

    niceTicks(mx, mx + rx, 8).forEach((v) => {
      const x = w * ((v - mx) / rx);
      if (x > m.left && x < w) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h - m.bottom);
      }
    });
    ctx.stroke();
  },

  afterDraw(ctx, chart) {
    const { w, h, m, rx, ry, mx, my, bg, font, text } = getViewState(chart);
    const {
      formatX = String,
      formatY = String,
      labelSize = ChartManager.DEFAULT_LABEL_SIZE,
    } = chart.config;

    // Compact Fade Gradients
    const drawFade = (
      dir: "left" | "bottom",
      x: number,
      y: number,
      fw: number,
      fh: number,
    ) => {
      const g =
        dir === "left"
          ? ctx.createLinearGradient(x, 0, x + fw, 0)
          : ctx.createLinearGradient(0, y, 0, y + fh);
      const alphas =
        dir === "left" ? [1, 0.7, 0.2, 0.05, 0] : [0, 0.05, 0.2, 0.7, 1];
      [0, 0.35, 0.55, 0.7, 1].forEach((s, i) =>
        g.addColorStop(s, `rgba(${bg},${alphas[i]})`),
      );
      ctx.fillStyle = g;
      ctx.fillRect(x, y, fw, fh);
    };
    drawFade("left", 0, 0, m.left + 20, h);
    drawFade("bottom", 0, h - m.bottom - 20, w, m.bottom + 20);

    ctx.font = `${labelSize}px ${font}`;
    ctx.fillStyle = text;

    // Y Labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    niceTicks(my, my + ry, 7).forEach((v) => {
      const y = h * (1 - (v - my) / ry);
      if (y > 5 && y < h - m.bottom - 5)
        ctx.fillText(formatY(v), m.left - 5, y);
    });

    // X Labels
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    niceTicks(mx, mx + rx, 8).forEach((v) => {
      const x = w * ((v - mx) / rx);
      if (x < m.left - 10 || x > w + 30) return;
      ctx.save();
      ctx.translate(x, h - m.bottom + 5);
      ctx.rotate(-Math.PI / 14);
      ctx.fillText(formatX(v), 0, 0);
      ctx.restore();
    });
  },
};
