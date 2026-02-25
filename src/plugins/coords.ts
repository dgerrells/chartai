import type { InternalChart } from "../types.ts";

/**
 * Convert a data-space point to canvas pixel coordinates.
 * width/height should be the CSS pixel dimensions of the chart element.
 */
export function dataToScreen(
  dataX: number,
  dataY: number,
  chart: InternalChart,
  width: number,
  height: number,
): { x: number; y: number } {
  const rX = chart.bounds.maxX - chart.bounds.minX;
  const rY = chart.bounds.maxY - chart.bounds.minY;
  const vW = rX / chart.view.zoomX;
  const vH = rY / chart.view.zoomY;
  const vMinX = chart.bounds.minX + chart.view.panX * rX;
  const vMinY = chart.bounds.minY + chart.view.panY * rY;
  return {
    x: ((dataX - vMinX) / vW) * width,
    y: height * (1 - (dataY - vMinY) / vH),
  };
}

/**
 * Convert canvas pixel coordinates to data-space.
 * width/height should be the CSS pixel dimensions of the chart element.
 */
export function screenToData(
  screenX: number,
  screenY: number,
  chart: InternalChart,
  width: number,
  height: number,
): { x: number; y: number } {
  const rX = chart.bounds.maxX - chart.bounds.minX;
  const rY = chart.bounds.maxY - chart.bounds.minY;
  const vW = rX / chart.view.zoomX;
  const vH = rY / chart.view.zoomY;
  const vMinX = chart.bounds.minX + chart.view.panX * rX;
  const vMinY = chart.bounds.minY + chart.view.panY * rY;
  return {
    x: vMinX + (screenX / width) * vW,
    y: vMinY + (1 - screenY / height) * vH,
  };
}
