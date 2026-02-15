import { UNIFORM_STRUCT, BINARY_SEARCH, COMPUTE_WG } from "./shared.ts";

export const BOX_COMPUTE_SHADER = `${UNIFORM_STRUCT}
struct BarData {
screenX: f32,
minY: f32,
maxY: f32,
barWidth: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read> dataY: array<f32>;
@group(0) @binding(3) var<storage, read_write> barData: array<BarData>;
@group(0) @binding(4) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(5) var<uniform> seriesIdx: SeriesIndex;
${BINARY_SEARCH}
fn barHalfWidth(idx: u32, count: u32) -> f32 {
if (count <= 1u) {
return (u.viewMaxX - u.viewMinX) * 0.4;
}
var spacing: f32;
if (idx == 0u) {
spacing = dataX[1u] - dataX[0u];
} else if (idx >= count - 1u) {
spacing = dataX[count - 1u] - dataX[count - 2u];
} else {
spacing = min(dataX[idx + 1u] - dataX[idx], dataX[idx] - dataX[idx - 1u]);
}
let seriesCount = max(1u, u.seriesCount);
return (spacing * 0.4) / f32(seriesCount);
}
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
let outputIdx = id.x;
let maxCols = u32(u.width);
let count = u.pointCount;
if (outputIdx >= maxCols || count == 0u) {
if (outputIdx < maxCols) {
barData[outputIdx] = BarData(0.0, 0.0, 0.0, 0.0);
}
return;
}
let viewRangeX = u.viewMaxX - u.viewMinX;
let viewRangeY = u.viewMaxY - u.viewMinY;
if (viewRangeX < 0.0001 || viewRangeY < 0.0001) {
barData[outputIdx] = BarData(0.0, 0.0, 0.0, 0.0);
return;
}
let relPx = f32(outputIdx);
let pixelMinX = u.viewMinX + (relPx / u.width) * viewRangeX;
let pixelMaxX = u.viewMinX + ((relPx + 1.0) / u.width) * viewRangeX;
let startIdx = lowerBound(pixelMinX, count);
var endIdx = lowerBound(pixelMaxX, count);
endIdx = min(endIdx, count);
let centerX = (pixelMinX + pixelMaxX) * 0.5;
let onePixel = 1.0 / u.width;
if (startIdx >= endIdx) {
var hit = false;
var bestX: f32 = 0.0;
var bestY: f32 = 0.0;
var bestHW: f32 = 0.0;
var bestDist: f32 = 1e10;
if (startIdx < count) {
let bx = dataX[startIdx];
let hw = barHalfWidth(startIdx, count);
if (pixelMinX < bx + hw && pixelMaxX > bx - hw) {
let d = abs(bx - centerX);
bestX = bx; bestY = dataY[startIdx]; bestHW = hw; bestDist = d;
hit = true;
}
}
if (startIdx > 0u) {
let prev = startIdx - 1u;
let bx = dataX[prev];
let hw = barHalfWidth(prev, count);
if (pixelMinX < bx + hw && pixelMaxX > bx - hw) {
let d = abs(bx - centerX);
if (d < bestDist) {
bestX = bx; bestY = dataY[prev]; bestHW = hw; bestDist = d;
}
hit = true;
}
}
if (!hit) {
barData[outputIdx] = BarData(0.0, 0.0, 0.0, 0.0);
return;
}
let seriesCount = max(1u, u.seriesCount);
let barOffset = (f32(seriesIdx.index) - f32(seriesCount - 1u) * 0.5) * (bestHW * 2.0);
let offsetX = bestX + barOffset;
let normX = (offsetX - u.viewMinX) / viewRangeX;
let fullWidth = bestHW * 2.0 / viewRangeX;
let gapSize = max(onePixel, fullWidth * 0.05);
let bw = max(fullWidth - gapSize, onePixel);
barData[outputIdx] = BarData(normX, bestY, bestY, bw);
return;
}
var dataMinY = dataY[startIdx];
var dataMaxY = dataY[startIdx];
let rangeCount = endIdx - startIdx;
let maxSamples = u.maxSamplesPerPixel;
if (maxSamples > 0u && rangeCount > maxSamples) {
let stride = f32(rangeCount - 1u) / f32(maxSamples - 1u);
for (var s = 0u; s < maxSamples; s++) {
let idx = startIdx + u32(f32(s) * stride);
if (idx < endIdx) {
let y = dataY[idx];
dataMinY = min(dataMinY, y);
dataMaxY = max(dataMaxY, y);
}
}
let lastY = dataY[endIdx - 1u];
dataMinY = min(dataMinY, lastY);
dataMaxY = max(dataMaxY, lastY);
} else {
for (var i = startIdx + 1u; i < endIdx; i++) {
let y = dataY[i];
dataMinY = min(dataMinY, y);
dataMaxY = max(dataMaxY, y);
}
}
let hw = barHalfWidth(startIdx, count);
let fullWidth = hw * 2.0 / viewRangeX;
let gapSize = max(onePixel, fullWidth * 0.05);
let bw = max(fullWidth - gapSize, onePixel);
let seriesCount = max(1u, u.seriesCount);
let barOffset = (f32(seriesIdx.index) - f32(seriesCount - 1u) * 0.5) * (hw * 2.0);
let dataX_centered = dataX[startIdx] + barOffset;
let normX = (dataX_centered - u.viewMinX) / viewRangeX;
barData[outputIdx] = BarData(normX, dataMinY, dataMaxY, bw);
}
`;

export const BOX_RENDER_SHADER = `${UNIFORM_STRUCT}
struct BarData {
screenX: f32,
minY: f32,
maxY: f32,
barWidth: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> barData: array<BarData>;
@group(0) @binding(2) var<storage, read> allSeries: array<SeriesInfo>;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) normY: f32,
@location(1) @interpolate(flat) seriesIdx: u32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) series_idx: u32) -> VertexOutput {
var out: VertexOutput;
out.seriesIdx = series_idx;
let maxCols = u32(u.width);
let colIdx = vi / 6u;
let vertexType = vi % 6u;
if (colIdx >= maxCols) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
out.normY = 0.0;
return out;
}
let bd = barData[colIdx];
if (bd.barWidth <= 0.0) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
out.normY = 0.0;
return out;
}
let viewRangeY = u.viewMaxY - u.viewMinY;
let safeRangeY = select(viewRangeY, 1.0, viewRangeY < 0.0001);
let normMinY = (min(bd.minY, 0.0) - u.viewMinY) / safeRangeY;
let normMaxY = (max(bd.maxY, 0.0) - u.viewMinY) / safeRangeY;
let top = 1.0 - normMaxY;
let bottom = 1.0 - normMinY;
let halfW = bd.barWidth * 0.5;
let left = bd.screenX - halfW;
let right = bd.screenX + halfW;
var positions = array<vec2f, 6>(
vec2f(left, bottom),
vec2f(right, bottom),
vec2f(left, top),
vec2f(left, top),
vec2f(right, bottom),
vec2f(right, top)
);
let screenPos = positions[vertexType];
let clipX = screenPos.x * 2.0 - 1.0;
let clipY = 1.0 - screenPos.y * 2.0;
out.pos = vec4f(clipX, clipY, 0.0, 1.0);
out.normY = normMaxY;
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
let series = allSeries[in.seriesIdx];
return vec4f(series.color.rgb, 0.85);
}
`;
