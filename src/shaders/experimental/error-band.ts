import { UNIFORM_STRUCT, BINARY_SEARCH, COMPUTE_WG } from "../shared.ts";

export const ERROR_BAND_COMPUTE_SHADER = `${UNIFORM_STRUCT}
struct ErrorBandUniforms {
maxSamplesPerPixel: u32,
bandOpacity: f32,
_p0: u32, _p1: u32,
};
struct BandData {
screenX: f32,
loScreenY: f32,
hiScreenY: f32,
centerScreenY: f32,
valid: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read> dataY: array<f32>;
@group(0) @binding(3) var<storage, read_write> bandData: array<BandData>;
@group(0) @binding(4) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(5) var<uniform> eu: ErrorBandUniforms;
@group(0) @binding(6) var<storage, read> loData: array<f32>;
@group(0) @binding(7) var<storage, read> hiData: array<f32>;
${BINARY_SEARCH}
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
let outputIdx = id.x;
let maxCols = u32(u.width);
let count = u.pointCount;
if (outputIdx >= maxCols || count == 0u) {
if (outputIdx < maxCols) {
bandData[outputIdx] = BandData(-1.0, -1.0, -1.0, -1.0, 0.0);
}
return;
}
let viewRangeX = u.viewMaxX - u.viewMinX;
let viewRangeY = u.viewMaxY - u.viewMinY;
if (viewRangeX < 0.0001 || viewRangeY < 0.0001) {
bandData[outputIdx] = BandData(-1.0, -1.0, -1.0, -1.0, 0.0);
return;
}
let relPx = f32(outputIdx);
let pixelMinX = u.viewMinX + (relPx / u.width) * viewRangeX;
let pixelMaxX = u.viewMinX + ((relPx + 1.0) / u.width) * viewRangeX;
if (pixelMaxX < u.dataMinX || pixelMinX > u.dataMaxX) {
bandData[outputIdx] = BandData(-1.0, -1.0, -1.0, -1.0, 0.0);
return;
}
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
bandData[outputIdx] = BandData(-1.0, -1.0, -1.0, -1.0, 0.0);
return;
}
let y = dataY[bestIdx];
let lo = loData[bestIdx];
let hi = hiData[bestIdx];
let normX = (dataX[bestIdx] - u.viewMinX) / viewRangeX;
let normY = (y - u.viewMinY) / viewRangeY;
let normLo = (lo - u.viewMinY) / viewRangeY;
let normHi = (hi - u.viewMinY) / viewRangeY;
bandData[outputIdx] = BandData(normX, 1.0 - normLo, 1.0 - normHi, 1.0 - normY, 1.0);
return;
}
var dataMinY = dataY[startIdx];
var dataMaxY = dataY[startIdx];
var dataMinLo = loData[startIdx];
var dataMaxHi = hiData[startIdx];
let rangeCount = endIdx - startIdx;
let maxSamples = eu.maxSamplesPerPixel;
if (maxSamples > 1u && rangeCount > maxSamples) {
let stride = f32(rangeCount - 1u) / f32(maxSamples - 1u);
for (var s = 0u; s < maxSamples; s++) {
let idx = startIdx + u32(f32(s) * stride);
if (idx < endIdx) {
let y = dataY[idx];
dataMinY = min(dataMinY, y);
dataMaxY = max(dataMaxY, y);
dataMinLo = min(dataMinLo, loData[idx]);
dataMaxHi = max(dataMaxHi, hiData[idx]);
}
}
let lastY = dataY[endIdx - 1u];
dataMinY = min(dataMinY, lastY);
dataMaxY = max(dataMaxY, lastY);
dataMinLo = min(dataMinLo, loData[endIdx - 1u]);
dataMaxHi = max(dataMaxHi, hiData[endIdx - 1u]);
} else {
for (var i = startIdx + 1u; i < endIdx; i++) {
let y = dataY[i];
dataMinY = min(dataMinY, y);
dataMaxY = max(dataMaxY, y);
dataMinLo = min(dataMinLo, loData[i]);
dataMaxHi = max(dataMaxHi, hiData[i]);
}
}
let normX = (centerX - u.viewMinX) / viewRangeX;
let normMinLo = (dataMinLo - u.viewMinY) / viewRangeY;
let normMaxHi = (dataMaxHi - u.viewMinY) / viewRangeY;
let normMinY = (dataMinY - u.viewMinY) / viewRangeY;
let normMaxY = (dataMaxY - u.viewMinY) / viewRangeY;
let loScreenY = 1.0 - normMinLo;
let hiScreenY = 1.0 - normMaxHi;
let centerScreenY = 1.0 - (normMinY + normMaxY) * 0.5;
bandData[outputIdx] = BandData(normX, loScreenY, hiScreenY, centerScreenY, 1.0);
}
`;

export const ERROR_BAND_FILL_RENDER_SHADER = `${UNIFORM_STRUCT}
struct ErrorBandUniforms {
maxSamplesPerPixel: u32,
bandOpacity: f32,
_p0: u32, _p1: u32,
};
struct BandData {
screenX: f32,
loScreenY: f32,
hiScreenY: f32,
centerScreenY: f32,
valid: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> bandData: array<BandData>;
@group(0) @binding(2) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(3) var<uniform> eu: ErrorBandUniforms;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) @interpolate(flat) seriesIdx: u32,
@location(1) @interpolate(flat) valid: f32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) series_idx: u32) -> VertexOutput {
var out: VertexOutput;
out.seriesIdx = series_idx;
out.valid = 0.0;
let maxCols = u32(u.width);
if (vi >= maxCols * 2u) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
return out;
}
let col = vi / 2u;
let onHi = (vi % 2u) == 0u;
let d = bandData[col];
let viewRangeX = u.viewMaxX - u.viewMinX;
let leftBound = select(0.0, clamp((u.dataMinX - u.viewMinX) / viewRangeX, 0.0, 1.0), viewRangeX > 0.0001);
let rightBound = select(1.0, clamp((u.dataMaxX - u.viewMinX) / viewRangeX, 0.0, 1.0), viewRangeX > 0.0001);
var sx = clamp(d.screenX, leftBound, rightBound);
var py = select(d.loScreenY, d.hiScreenY, onHi);
if (d.valid < 0.5 && vi > 0u) {
let prevCol = (vi - 1u) / 2u;
let pd = bandData[prevCol];
sx = clamp(pd.screenX, leftBound, rightBound);
py = select(pd.loScreenY, pd.hiScreenY, (vi - 1u) % 2u == 0u);
}
let clipX = sx * 2.0 - 1.0;
let clipY = 1.0 - py * 2.0;
out.valid = d.valid;
out.pos = vec4f(clipX, clipY, 0.0, 1.0);
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
if (in.valid < 0.5) { discard; }
let series = allSeries[in.seriesIdx];
return vec4f(series.color.rgb, eu.bandOpacity);
}
`;

export const ERROR_BAND_LINE_RENDER_SHADER = `${UNIFORM_STRUCT}
struct BandData {
screenX: f32,
loScreenY: f32,
hiScreenY: f32,
centerScreenY: f32,
valid: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> bandData: array<BandData>;
@group(0) @binding(2) var<storage, read> allSeries: array<SeriesInfo>;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) alpha: f32,
@location(1) @interpolate(flat) seriesIdx: u32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) series_idx: u32) -> VertexOutput {
var out: VertexOutput;
out.seriesIdx = series_idx;
out.alpha = 0.0;
let maxCols = u32(u.width);
let segIdx = vi / 2u;
let endpoint = vi % 2u;
if (segIdx + 1u > maxCols) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
return out;
}
let col = segIdx + endpoint;
if (col >= maxCols) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
return out;
}
let d = bandData[col];
let d0 = bandData[segIdx];
let d1 = bandData[segIdx + 1u];
let segValid = min(d0.valid, d1.valid);
out.pos = vec4f(d.screenX * 2.0 - 1.0, 1.0 - d.centerScreenY * 2.0, 0.0, segValid);
out.alpha = segValid;
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
if (in.alpha < 0.1) { discard; }
let series = allSeries[in.seriesIdx];
return vec4f(series.color.rgb, 1.0);
}
`;
