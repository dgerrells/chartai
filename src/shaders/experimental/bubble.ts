import { UNIFORM_STRUCT, COMPUTE_WG } from "../shared.ts";

export const BUBBLE_COMPUTE_SHADER = `${UNIFORM_STRUCT}
struct BubbleUniforms {
  dispatchXCount: u32,
  maxPointSize: f32,
  minPointSize: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read> dataY: array<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(5) var<uniform> seriesIdx: SeriesIndex;
@group(0) @binding(6) var<uniform> bu: BubbleUniforms;
@group(0) @binding(7) var<storage, read> dataR: array<f32>;
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let series = allSeries[seriesIdx.index];
  let visStart = series.visibleRange.x;
  let visCount = series.visibleRange.y;
  let localIdx = id.y * bu.dispatchXCount + id.x;
  if (localIdx >= visCount) { return; }
  let idx = visStart + localIdx;
  if (idx >= u.pointCount) { return; }
  let x = dataX[idx];
  let y = dataY[idx];
  let r = dataR[idx];
  if (r <= 0.0) { return; }
  let width = u32(u.width);
  let height = u32(u.height);
  let rangeX = u.viewMaxX - u.viewMinX;
  let rangeY = u.viewMaxY - u.viewMinY;
  if (rangeX < 0.0001 || rangeY < 0.0001) { return; }
  let normX = (x - u.viewMinX) / rangeX;
  let normY = (y - u.viewMinY) / rangeY;
  let pixelX = i32(normX * f32(width));
  let pixelY = i32((1.0 - normY) * f32(height));
  let minDim = min(u.width, u.height);
  let maxRange = max(rangeX, rangeY);
  let rawRadius = r * minDim / maxRange;
  let radius = i32(clamp(rawRadius, bu.minPointSize, bu.maxPointSize));
  let iWidth = i32(width);
  let iHeight = i32(height);
  let borderR: f32 = max(1.0, f32(radius) * 0.08);
  let innerR = f32(radius) - borderR;
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      let dist2 = f32(dx * dx + dy * dy);
      if (dist2 > f32(radius * radius)) { continue; }
      let px = pixelX + dx;
      let py = pixelY + dy;
      if (px >= 0 && px < iWidth && py >= 0 && py < iHeight) {
        var fillColor: vec4f;
        if (dist2 > innerR * innerR) {
          fillColor = vec4f(series.color.rgb * 0.5, 0.95);
        } else {
          fillColor = vec4f(series.color.rgb, 0.65);
        }
        textureStore(outputTex, vec2i(px, py), fillColor);
      }
    }
  }
}
`;
