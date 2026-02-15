import { UNIFORM_STRUCT, BINARY_SEARCH, COMPUTE_WG } from "./shared.ts";

export const LINE_COMPUTE_SHADER = `${UNIFORM_STRUCT}
struct LineData {
screenX: f32,
minScreenY: f32,
maxScreenY: f32,
valid: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read> dataY: array<f32>;
@group(0) @binding(3) var<storage, read_write> lineData: array<LineData>;
@group(0) @binding(4) var<storage, read> allSeries: array<SeriesInfo>;
${BINARY_SEARCH}
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
let outputIdx = id.x;
let maxCols = u32(u.width);
let count = u.pointCount;
if (outputIdx >= maxCols || count == 0u) {
if (outputIdx < maxCols) {
lineData[outputIdx] = LineData(-1.0, -1.0, -1.0, 0.0);
}
return;
}
let viewRangeX = u.viewMaxX - u.viewMinX;
let viewRangeY = u.viewMaxY - u.viewMinY;
if (viewRangeX < 0.0001 || viewRangeY < 0.0001) {
lineData[outputIdx] = LineData(-1.0, -1.0, -1.0, 0.0);
return;
}
let relPx = f32(outputIdx);
let pixelMinX = u.viewMinX + (relPx / u.width) * viewRangeX;
let pixelMaxX = u.viewMinX + ((relPx + 1.0) / u.width) * viewRangeX;
let startIdx = lowerBound(pixelMinX, count);
var endIdx = lowerBound(pixelMaxX, count);
endIdx = min(endIdx, count);
let centerX = (pixelMinX + pixelMaxX) * 0.5;
if (startIdx >= endIdx) {
var bestIdx = startIdx;
if (startIdx > 0u && startIdx < count) {
let distPrev = abs(dataX[startIdx - 1u] - centerX);
let distCurr = abs(dataX[startIdx] - centerX);
if (distPrev < distCurr) {
bestIdx = startIdx - 1u;
}
} else if (startIdx >= count && count > 0u) {
bestIdx = count - 1u;
}
if (bestIdx >= count) {
lineData[outputIdx] = LineData(-1.0, -1.0, -1.0, 0.0);
return;
}
let y = dataY[bestIdx];
let normY = (y - u.viewMinY) / viewRangeY;
let screenY = 1.0 - normY;
let normX = (dataX[bestIdx] - u.viewMinX) / viewRangeX;
let screenX = normX;
lineData[outputIdx] = LineData(screenX, screenY, screenY, 1.0);
return;
}
var dataMinY = dataY[startIdx];
var dataMaxY = dataY[startIdx];
let rangeCount = endIdx - startIdx;
let maxSamples = u.maxSamplesPerPixel;
if (maxSamples > 1u && rangeCount > maxSamples) {
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
let normX = (centerX - u.viewMinX) / viewRangeX;
let screenX = normX;
let normMaxY = (dataMaxY - u.viewMinY) / viewRangeY;
let normMinY = (dataMinY - u.viewMinY) / viewRangeY;
let minScreenY = 1.0 - normMaxY;
let maxScreenY = 1.0 - normMinY;
lineData[outputIdx] = LineData(screenX, minScreenY, maxScreenY, 1.0);
}
`;

export const LINE_RENDER_SHADER = `${UNIFORM_STRUCT}
struct LineData {
screenX: f32,
minScreenY: f32,
maxScreenY: f32,
valid: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> lineData: array<LineData>;
@group(0) @binding(2) var<storage, read> allSeries: array<SeriesInfo>;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) alpha: f32,
@location(1) @interpolate(flat) seriesIdx: u32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) series_idx: u32) -> VertexOutput {
var out: VertexOutput;
out.seriesIdx = series_idx;
let maxCols = u32(u.width);
let segIdx = vi / 2u;
let endpoint = vi % 2u;
if (segIdx < maxCols) {
let d = lineData[segIdx];
let y = select(d.maxScreenY, d.minScreenY, endpoint == 0u);
out.pos = vec4f(d.screenX * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, d.valid);
out.alpha = d.valid;
} else {
let connIdx = segIdx - maxCols;
if (connIdx + 1u >= maxCols) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
out.alpha = 0.0;
return out;
}
let d0 = lineData[connIdx];
let d1 = lineData[connIdx + 1u];
let segValid = min(d0.valid, d1.valid);
if (endpoint == 0u) {
let midY = (d0.minScreenY + d0.maxScreenY) * 0.5;
out.pos = vec4f(d0.screenX * 2.0 - 1.0, 1.0 - midY * 2.0, 0.0, segValid);
} else {
let midY = (d1.minScreenY + d1.maxScreenY) * 0.5;
out.pos = vec4f(d1.screenX * 2.0 - 1.0, 1.0 - midY * 2.0, 0.0, segValid);
}
out.alpha = segValid;
}
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
if (in.alpha < 0.1) { discard; }
let series = allSeries[in.seriesIdx];
return vec4f(series.color.rgb, 1.0);
}
`;
