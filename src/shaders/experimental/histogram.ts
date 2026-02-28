import { UNIFORM_STRUCT, COMPUTE_WG } from "../shared.ts";

const HIST_UNIFORMS_STRUCT = `struct HistUniforms {
binCount: u32,
minValue: f32,
maxValue: f32,
_p0: f32,
};
`;

export const HIST_CLEAR_SHADER = `${UNIFORM_STRUCT}
${HIST_UNIFORMS_STRUCT}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read_write> histBuffer: array<u32>;
@group(0) @binding(2) var<uniform> hu: HistUniforms;
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
let idx = id.x;
if (idx < 4096u) {
histBuffer[idx] = 0u;
}
}
`;

export const HIST_COUNT_SHADER = `${UNIFORM_STRUCT}
${HIST_UNIFORMS_STRUCT}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read_write> histBuffer: array<atomic<u32>>;
@group(0) @binding(3) var<uniform> hu: HistUniforms;
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
let idx = id.x;
let count = u.pointCount;
if (idx >= count) {
return;
}
let x = dataX[idx];
let useCustomRange = hu.minValue < hu.maxValue;
let minVal = select(u.dataMinX, hu.minValue, useCustomRange);
let maxVal = select(u.dataMaxX, hu.maxValue, useCustomRange);
let range = maxVal - minVal;
if (range <= 0.0) {
return;
}
let binCount = select(u32(u.width), hu.binCount, hu.binCount > 0u);
let binF = (x - minVal) / range * f32(binCount);
let bin = u32(clamp(binF, 0.0, f32(binCount) - 1.0));
if (bin < 4096u) {
atomicAdd(&histBuffer[bin], 1u);
}
}
`;

export const HIST_FIND_MAX_SHADER = `${UNIFORM_STRUCT}
${HIST_UNIFORMS_STRUCT}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> histBuffer: array<u32>;
@group(0) @binding(2) var<storage, read_write> maxBuffer: array<u32>;
@group(0) @binding(3) var<uniform> hu: HistUniforms;
@compute @workgroup_size(1)
fn main() {
let binCount = select(u32(u.width), hu.binCount, hu.binCount > 0u);
let safeBins = min(binCount, 4096u);
var maxVal = 0u;
for (var i = 0u; i < safeBins; i++) {
let v = histBuffer[i];
if (v > maxVal) {
maxVal = v;
}
}
maxBuffer[0] = maxVal;
}
`;

export const HIST_RENDER_SHADER = `${UNIFORM_STRUCT}
${HIST_UNIFORMS_STRUCT}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> histBuffer: array<u32>;
@group(0) @binding(2) var<storage, read> maxBuffer: array<u32>;
@group(0) @binding(3) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(4) var<uniform> si: SeriesIndex;
@group(0) @binding(5) var<uniform> hu: HistUniforms;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) alpha: f32,
@location(1) @interpolate(flat) seriesIdx: u32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
var out: VertexOutput;
out.seriesIdx = si.index;
let colIdx = vi / 6u;
let vertexType = vi % 6u;
let binCount = select(u32(u.width), hu.binCount, hu.binCount > 0u);
let maxCount = maxBuffer[0];
if (colIdx >= binCount || colIdx >= 4096u || maxCount == 0u) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
out.alpha = 0.0;
return out;
}
let count = histBuffer[colIdx];
if (count == 0u) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
out.alpha = 0.0;
return out;
}
let useCustomRange = hu.minValue < hu.maxValue;
let minVal = select(u.dataMinX, hu.minValue, useCustomRange);
let maxVal = select(u.dataMaxX, hu.maxValue, useCustomRange);
let range = maxVal - minVal;
let viewRangeX = u.viewMaxX - u.viewMinX;
let viewRangeY = u.viewMaxY - u.viewMinY;
let safeRangeX = select(viewRangeX, 1.0, viewRangeX < 0.0001);
let safeRangeY = select(viewRangeY, 1.0, viewRangeY < 0.0001);
let binLeft = minVal + f32(colIdx) / f32(binCount) * range;
let binRight = minVal + f32(colIdx + 1u) / f32(binCount) * range;
let screenLeft = (binLeft - u.viewMinX) / safeRangeX;
let screenRight = (binRight - u.viewMinX) / safeRangeX;
let screenBottom = 1.0 - (0.0 - u.viewMinY) / safeRangeY;
let screenTop = 1.0 - (f32(count) - u.viewMinY) / safeRangeY;
var positions = array<vec2f, 6>(
vec2f(screenLeft, screenBottom),
vec2f(screenRight, screenBottom),
vec2f(screenLeft, screenTop),
vec2f(screenLeft, screenTop),
vec2f(screenRight, screenBottom),
vec2f(screenRight, screenTop)
);
let screenPos = positions[vertexType];
out.pos = vec4f(screenPos.x * 2.0 - 1.0, 1.0 - screenPos.y * 2.0, 0.0, 1.0);
out.alpha = 1.0;
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
if (in.alpha < 0.1) { discard; }
let series = allSeries[in.seriesIdx];
return vec4f(series.color.rgb, 0.85);
}
`;
