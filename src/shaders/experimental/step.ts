import { UNIFORM_STRUCT } from "../shared.ts";

export { LINE_COMPUTE_SHADER } from "../line.ts";

export const STEP_RENDER_SHADER = `${UNIFORM_STRUCT}
struct LineData {
screenX: f32,
minScreenY: f32,
maxScreenY: f32,
valid: f32,
};
struct StepUniforms {
maxSamplesPerPixel: u32,
stepMode: u32,
_p2: u32,
_p3: u32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> lineData: array<LineData>;
@group(0) @binding(2) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(3) var<uniform> su: StepUniforms;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) alpha: f32,
@location(1) @interpolate(flat) seriesIdx: u32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) series_idx: u32) -> VertexOutput {
var out: VertexOutput;
out.seriesIdx = series_idx;
let maxCols = u32(u.width);
let spanVerts = maxCols * 2u;
if (vi < spanVerts) {
let segIdx = vi / 2u;
let endpoint = vi % 2u;
let d = lineData[segIdx];
let y = select(d.maxScreenY, d.minScreenY, endpoint == 0u);
out.pos = vec4f(d.screenX * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, d.valid);
out.alpha = d.valid;
} else {
let connOffset = vi - spanVerts;
let connIdx = connOffset / 4u;
let localVert = connOffset % 4u;
let segInConn = localVert / 2u;
let endpoint = localVert % 2u;
if (connIdx + 1u >= maxCols) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
out.alpha = 0.0;
return out;
}
let d0 = lineData[connIdx];
let d1 = lineData[connIdx + 1u];
let segValid = min(d0.valid, d1.valid);
let midY0 = (d0.minScreenY + d0.maxScreenY) * 0.5;
let midY1 = (d1.minScreenY + d1.maxScreenY) * 0.5;
let midX = (d0.screenX + d1.screenX) * 0.5;
var px: f32;
var py: f32;
if (su.stepMode == 0u) {
if (segInConn == 0u) {
px = select(d0.screenX, d1.screenX, endpoint == 1u);
py = midY0;
} else {
px = d1.screenX;
py = select(midY0, midY1, endpoint == 1u);
}
} else if (su.stepMode == 1u) {
if (segInConn == 0u) {
px = d0.screenX;
py = select(midY0, midY1, endpoint == 1u);
} else {
px = select(d0.screenX, d1.screenX, endpoint == 1u);
py = midY1;
}
} else {
if (segInConn == 0u) {
px = select(d0.screenX, midX, endpoint == 1u);
py = midY0;
} else {
px = midX;
py = select(midY0, midY1, endpoint == 1u);
}
}
out.pos = vec4f(px * 2.0 - 1.0, 1.0 - py * 2.0, 0.0, segValid);
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
