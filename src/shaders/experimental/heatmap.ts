import { UNIFORM_STRUCT, COMPUTE_WG } from "../shared.ts";

export const HEATMAP_COMPUTE_SHADER = `${UNIFORM_STRUCT}
struct HeatmapUniforms {
  dispatchXCount: u32,
  gridColumns: u32,
  gridRows: u32,
  colorScale: u32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read> dataY: array<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(5) var<uniform> seriesIdx: SeriesIndex;
@group(0) @binding(6) var<uniform> hu: HeatmapUniforms;
@group(0) @binding(7) var<storage, read> dataValue: array<f32>;
fn viridis(t: f32) -> vec3f {
  let c0 = vec3f(0.267, 0.005, 0.329);
  let c1 = vec3f(0.229, 0.322, 0.545);
  let c2 = vec3f(0.128, 0.566, 0.551);
  let c3 = vec3f(0.370, 0.789, 0.383);
  let c4 = vec3f(0.993, 0.906, 0.144);
  let s = clamp(t, 0.0, 1.0) * 4.0;
  let i = u32(s);
  let f = s - f32(i);
  if (i == 0u) { return mix(c0, c1, f); }
  if (i == 1u) { return mix(c1, c2, f); }
  if (i == 2u) { return mix(c2, c3, f); }
  return mix(c3, c4, clamp(f, 0.0, 1.0));
}
fn plasma(t: f32) -> vec3f {
  let c0 = vec3f(0.050, 0.030, 0.528);
  let c1 = vec3f(0.558, 0.003, 0.667);
  let c2 = vec3f(0.879, 0.176, 0.334);
  let c3 = vec3f(0.980, 0.534, 0.125);
  let c4 = vec3f(0.940, 0.975, 0.131);
  let s = clamp(t, 0.0, 1.0) * 4.0;
  let i = u32(s);
  let f = s - f32(i);
  if (i == 0u) { return mix(c0, c1, f); }
  if (i == 1u) { return mix(c1, c2, f); }
  if (i == 2u) { return mix(c2, c3, f); }
  return mix(c3, c4, clamp(f, 0.0, 1.0));
}
fn applyColorScale(t: f32, scale: u32) -> vec3f {
  let tc = clamp(t, 0.0, 1.0);
  if (scale == 1u) { return plasma(tc); }
  if (scale == 2u) { return mix(vec3f(0.0, 1.0, 1.0), vec3f(1.0, 0.0, 1.0), tc); }
  if (scale == 3u) { return mix(vec3f(1.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), tc); }
  return viridis(tc);
}
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let series = allSeries[seriesIdx.index];
  let visStart = series.visibleRange.x;
  let visCount = series.visibleRange.y;
  let localIdx = id.y * hu.dispatchXCount + id.x;
  if (localIdx >= visCount) { return; }
  let idx = visStart + localIdx;
  if (idx >= u.pointCount) { return; }
  let col = dataX[idx];
  let row = dataY[idx];
  let t = dataValue[idx];
  let rangeX = u.viewMaxX - u.viewMinX;
  let rangeY = u.viewMaxY - u.viewMinY;
  if (rangeX < 0.0001 || rangeY < 0.0001) { return; }
  let normX = (col - u.viewMinX) / rangeX;
  let normY = (row - u.viewMinY) / rangeY;
  let centerX = normX * u.width;
  let centerY = (1.0 - normY) * u.height;
  let cellHalfW = 0.5 * u.width / rangeX;
  let cellHalfH = 0.5 * u.height / rangeY;
  let iWidth = i32(u.width);
  let iHeight = i32(u.height);
  let x0 = max(0, i32(centerX - cellHalfW));
  let x1 = min(iWidth - 1, i32(centerX + cellHalfW));
  let y0 = max(0, i32(centerY - cellHalfH));
  let y1 = min(iHeight - 1, i32(centerY + cellHalfH));
  if (x0 > x1 || y0 > y1) { return; }
  let rgb = applyColorScale(t, hu.colorScale);
  let color = vec4f(rgb, 1.0);
  for (var py = y0; py <= y1; py++) {
    for (var px = x0; px <= x1; px++) {
      textureStore(outputTex, vec2i(px, py), color);
    }
  }
}
`;
