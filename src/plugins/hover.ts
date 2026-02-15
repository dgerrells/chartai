import type {
  ChartPlugin,
  InternalChart,
  HoverData,
} from "../chart-library.ts";
import { ChartManager } from "../chart-library.ts";

interface HoverState {
  hoverResult: HoverData | null;
  pillX: number;
  pillY: number;
  pillTargetX: number;
  pillTargetY: number;
  pillAnimRef: number | null;
  abort: AbortController;
}

const states = new WeakMap<InternalChart, HoverState>();

const drawBox = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke: string,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
};

export const hoverPlugin: ChartPlugin = {
  name: "hover",

  install(chart, el) {
    const mgr = ChartManager.getInstance();
    const ac = new AbortController();
    const s: HoverState = {
      hoverResult: null,
      pillX: 0,
      pillY: 0,
      pillTargetX: 0,
      pillTargetY: 0,
      pillAnimRef: null,
      abort: ac,
    };
    states.set(chart, s);

    const update = (res: HoverData | null) => {
      if (chart.config.onHover) chart.config.onHover(res);
      if (!(chart.config.showTooltip ?? false)) return;
      s.hoverResult = res;
      mgr.drawChart(chart);

      if (res && !s.pillAnimRef) {
        let lastT = performance.now();
        const tick = (now: number) => {
          if (!s.hoverResult) return (s.pillAnimRef = null);
          const f =
            1 - Math.pow(0.5, (now - lastT) / (chart.config.pillDecayMs ?? 60));
          lastT = now;
          s.pillX += (s.pillTargetX - s.pillX) * f;
          s.pillY += (s.pillTargetY - s.pillY) * f;
          mgr.drawChart(chart);
          s.pillAnimRef = requestAnimationFrame(tick);
        };
        s.pillAnimRef = requestAnimationFrame(tick);
      }
    };

    el.addEventListener(
      "mousemove",
      (e) => {
        if (chart.dragging) return;
        const r = el.getBoundingClientRect();
        update(
          chart.findNearestPoint(
            e.clientX - r.left,
            e.clientY - r.top,
            r.width,
            r.height,
          ),
        );
      },
      { signal: ac.signal },
    );

    ["mouseleave", "pointerdown"].forEach((ev) =>
      el.addEventListener(ev, () => update(null), { signal: ac.signal }),
    );
  },

  afterDraw(ctx, chart) {
    const s = states.get(chart);
    if (!s?.hoverResult || !chart.config.showTooltip) return;

    const { hoverResult: hvr } = s;
    const w = chart.width;
    const h = chart.height;
    const margin = ChartManager.MARGIN;
    const dark = ChartManager.getInstance().isDark;
    const {
      formatX = String,
      formatY = String,
      fontFamily = ChartManager.DEFAULT_FONT,
    } = chart.config;

    const rx = (chart.bounds.maxX - chart.bounds.minX) / chart.view.zoomX;
    const ry = (chart.bounds.maxY - chart.bounds.minY) / chart.view.zoomY;
    const px =
      ((hvr.x -
        (chart.bounds.minX +
          chart.view.panX * (chart.bounds.maxX - chart.bounds.minX))) /
        rx) *
      w;
    const py =
      h *
      (1 -
        (hvr.y -
          (chart.bounds.minY +
            chart.view.panY * (chart.bounds.maxY - chart.bounds.minY))) /
          ry);

    const mainSeries = chart.series[hvr.seriesIndex] || chart.series[0];
    const rgb = `${Math.round(mainSeries.color.r * 255)},${Math.round(mainSeries.color.g * 255)},${Math.round(mainSeries.color.b * 255)}`;
    const col = `rgb(${rgb})`;
    const textCol = dark ? `oklch(from ${col} calc(l + 0.1) c h)` : col;

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = `rgba(${rgb},0.4)`;
    ctx.stroke(
      new Path2D(`M${px} 0V${h - margin.bottom}M${margin.left} ${py}H${w}`),
    );
    ctx.restore();

    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)";
    ctx.stroke();

    const seriesData = chart.series
      .map((ser) => {
        let l = 0,
          r = ser.rawX.length - 1;
        while (l <= r) {
          const m = (l + r) >> 1;
          if (Math.abs(ser.rawX[m] - hvr.x) < 0.0001)
            return {
              label: ser.label,
              val: formatY(ser.rawY[m]),
              rawVal: ser.rawY[m],
              col: `rgb(${Math.round(ser.color.r * 255)},${Math.round(ser.color.g * 255)},${Math.round(ser.color.b * 255)})`,
            };
          ser.rawX[m] < hvr.x ? (l = m + 1) : (r = m - 1);
        }
        return null;
      })
      .filter(Boolean) as any[];

    // Sort by value (highest first) and truncate to top 5
    seriesData.sort((a, b) => Math.abs(b.rawVal) - Math.abs(a.rawVal));
    const totalSeries = seriesData.length;
    const displayData = seriesData.slice(0, 5);
    const remainingCount = totalSeries - displayData.length;

    s.pillTargetX = px;
    s.pillTargetY = py;
    if (!s.pillAnimRef) {
      s.pillX = px;
      s.pillY = py;
    }

    const drawPill = (x: number, y: number, txt: string, isX: boolean) => {
      ctx.font = `600 10px ${fontFamily}`;
      const tw = ctx.measureText(txt).width,
        pw = tw + 12,
        ph = 18;
      const ox = isX ? x - pw / 2 : x - pw,
        oy = isX ? y : y - ph / 2;

      ctx.save();
      const angle = isX
        ? Math.atan((s.pillTargetX - s.pillX) / 80) * 0.2
        : Math.atan((s.pillTargetY - s.pillY) / 80) * 0.2;
      ctx.translate(x, y);
      ctx.rotate(angle);
      const bx = isX ? -pw / 2 : -pw,
        by = isX ? 0 : -ph / 2;

      ctx.beginPath();
      ctx.roundRect(bx, by, pw, ph, 4);
      ctx.fillStyle = dark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.75)";
      ctx.fill();
      ctx.fillStyle = `rgba(${rgb},0.2)`;
      ctx.fill();
      ctx.strokeStyle = textCol;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = textCol;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, bx + pw / 2, by + ph / 2);
      ctx.restore();
    };

    drawPill(
      Math.max(margin.left, Math.min(w - margin.right, s.pillX)),
      h - margin.bottom + 4,
      formatX(hvr.x),
      true,
    );
    drawPill(
      Math.max(margin.left, margin.left),
      Math.max(9, Math.min(h - margin.bottom - 9, s.pillY)),
      formatY(hvr.y),
      false,
    );

    const boxW =
      Math.max(
        ...displayData.map((d) => ctx.measureText(d.label + d.val).width),
      ) + 40;
    const boxH = 30 + displayData.length * 18 + (remainingCount > 0 ? 18 : 0);
    let bx = hvr.screenX + 14,
      by = hvr.screenY - boxH - 6;
    if (bx + boxW > w) bx = hvr.screenX - boxW - 14;
    by = Math.max(4, Math.min(h - boxH - 4, hvr.screenY - boxH - 6));

    drawBox(
      ctx,
      bx,
      by,
      boxW,
      boxH,
      6,
      dark ? "rgba(28,28,30,0.95)" : "rgba(255,255,255,0.96)",
      "rgba(0,0,0,0.08)",
    );

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = dark ? "#888" : "#999";
    ctx.fillText(formatX(hvr.x), bx + 10, by + 15);
    displayData.forEach((sd, i) => {
      const ty = by + 35 + i * 18;
      ctx.fillStyle = sd.col;
      ctx.beginPath();
      ctx.roundRect(bx + 10, ty - 4, 8, 8, 2);
      ctx.fill();
      ctx.fillStyle = dark ? "#eee" : "#1a1a1a";
      ctx.fillText(`${sd.label}: ${sd.val}`, bx + 24, ty);
    });

    // Show "+N more" if there are remaining series
    if (remainingCount > 0) {
      const ty = by + 35 + displayData.length * 18;
      ctx.fillStyle = dark ? "#666" : "#aaa";
      ctx.fillText(`+${remainingCount} more`, bx + 10, ty);
    }
  },

  uninstall(chart) {
    const s = states.get(chart);
    if (s?.pillAnimRef) cancelAnimationFrame(s.pillAnimRef);
    s?.abort.abort();
    states.delete(chart);
  },
};
