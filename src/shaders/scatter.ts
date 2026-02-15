import { UNIFORM_STRUCT, COMPUTE_WG } from "./shared.ts";

export const SCATTER_COMPUTE_SHADER = `${UNIFORM_STRUCT}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read> dataY: array<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(5) var<uniform> seriesIdx: SeriesIndex;
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
let series = allSeries[seriesIdx.index];
let visStart = series.visibleRange.x;
let visCount = series.visibleRange.y;
let localIdx = id.y * u.dispatchXCount + id.x;
if (localIdx >= visCount) { return; }
let idx = visStart + localIdx;
let count = u.pointCount;
if (idx >= count) { return; }
let x = dataX[idx];
let y = dataY[idx];
if (y < u.viewMinY || y > u.viewMaxY) { return; }
let width = u32(u.width);
let height = u32(u.height);
let rangeX = u.viewMaxX - u.viewMinX;
let rangeY = u.viewMaxY - u.viewMinY;
if (rangeX < 0.0001 || rangeY < 0.0001) { return; }
let normX = (x - u.viewMinX) / rangeX;
let normY = (y - u.viewMinY) / rangeY;
let screenX = normX;
let screenY = 1.0 - normY;
let pixelX = i32(screenX * f32(width));
let pixelY = i32(screenY * f32(height));
if (idx > visStart) {
let prevX = dataX[idx - 1u];
let prevY = dataY[idx - 1u];
let prevNormX = (prevX - u.viewMinX) / rangeX;
let prevNormY = (prevY - u.viewMinY) / rangeY;
let prevPx = i32(prevNormX * f32(width));
let prevPy = i32((1.0 - prevNormY) * f32(height));
if (pixelX == prevPx && pixelY == prevPy) { return; }
}
let iWidth = i32(width);
let iHeight = i32(height);
if (pixelX < 0 || pixelX >= iWidth) { return; }
if (pixelY < 0 || pixelY >= iHeight) { return; }
let color = series.color;
let radius = i32(series.pointSize);
for (var dy = -radius; dy <= radius; dy++) {
for (var dx = -radius; dx <= radius; dx++) {
if (dx * dx + dy * dy > radius * radius) { continue; }
let px = pixelX + dx;
let py = pixelY + dy;
if (px >= 0 && px < iWidth && py >= 0 && py < iHeight) {
textureStore(outputTex, vec2i(px, py), color);
}
}
}
}
`;
