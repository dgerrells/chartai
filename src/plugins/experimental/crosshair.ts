import type { ChartPlugin, InternalChart } from "../../types.ts";
import { ChartManager } from "../../chart-library.ts";
import { MARGIN } from "../shared.ts";

export interface CrosshairConfig {
  crosshairX?: boolean;
  crosshairY?: boolean;
  crosshairColor?: string;
  crosshairDash?: [number, number];
  crosshairWidth?: number;
}

declare module "../types.ts" {
  interface ChartPluginRegistry {
    crosshair: CrosshairConfig;
  }
}

interface CrosshairState {
  mouseX: number;
  mouseY: number;
  visible: boolean;
  abort: AbortController;
}

const states = new WeakMap<InternalChart, CrosshairState>();

export const crosshairPlugin: ChartPlugin<CrosshairConfig> = {
  name: "crosshair",

  install(chart, el) {
    const ac = new AbortController();
    const state: CrosshairState = {
      mouseX: 0,
      mouseY: 0,
      visible: false,
      abort: ac,
    };
    states.set(chart, state);

    el.addEventListener(
      "mousemove",
      (e) => {
        e.preventDefault();
        if (chart.dragging) return;
        const r = el.getBoundingClientRect();
        state.mouseX = e.clientX - r.left;
        state.mouseY = e.clientY - r.top;
        state.visible = true;
        ChartManager.drawChart(chart);
      },
      { signal: ac.signal },
    );

    ["mouseleave", "pointerdown"].forEach((ev) =>
      el.addEventListener(
        ev,
        () => {
          state.visible = false;
          ChartManager.drawChart(chart);
        },
        { signal: ac.signal },
      ),
    );
  },

  afterDraw(ctx, chart) {
    const state = states.get(chart);
    if (!state?.visible) return;

    const cfg = chart.config as any;
    const showX: boolean = cfg.crosshairX ?? true;
    const showY: boolean = cfg.crosshairY ?? true;
    if (!showX && !showY) return;

    const { width: w, height: h } = chart;
    const m = MARGIN;
    const dark = ChartManager.isDark;
    const color: string =
      cfg.crosshairColor ??
      (dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)");
    const dash: [number, number] = cfg.crosshairDash ?? [4, 3];
    const lineWidth: number = cfg.crosshairWidth ?? 1;
    const { mouseX: mx, mouseY: my } = state;

    if (mx < m.left || mx > w - m.right || my < m.top || my > h - m.bottom) {
      state.visible = false;
      return;
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    if (showX) {
      ctx.moveTo(mx, m.top);
      ctx.lineTo(mx, h - m.bottom);
    }
    if (showY) {
      ctx.moveTo(m.left, my);
      ctx.lineTo(w - m.right, my);
    }
    ctx.stroke();
    ctx.restore();
  },

  uninstall(chart) {
    const state = states.get(chart);
    state?.abort.abort();
    states.delete(chart);
  },
};
