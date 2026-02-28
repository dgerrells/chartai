import { UNIFORM_STRUCT } from "../shared.ts";

export { LINE_COMPUTE_SHADER as BASELINE_AREA_COMPUTE_SHADER } from "../line.ts";

export const BASELINE_AREA_RENDER_SHADER = `${UNIFORM_STRUCT}
struct LineData {
screenX: f32,
minScreenY: f32,
maxScreenY: f32,
valid: f32,
};
struct BaselineAreaUniforms {
maxSamplesPerPixel: u32,
baseline: f32,
positiveColor: u32,
negativeColor: u32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> lineData: array<LineData>;
@group(0) @binding(2) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(3) var<uniform> bau: BaselineAreaUniforms;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) @interpolate(flat) seriesIdx: u32,
@location(1) @interpolate(flat) valid: f32,
@location(2) lineNormY: f32,
@location(3) baselineNormY: f32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) series_idx: u32) -> VertexOutput {
var out: VertexOutput;
out.seriesIdx = series_idx;
out.valid = 0.0;
out.lineNormY = 0.0;
out.baselineNormY = 0.0;
let maxCols = u32(u.width);
if (vi >= maxCols * 2u) {
out.pos = vec4f(0.0, 0.0, 0.0, 0.0);
return out;
}
let col = vi / 2u;
let onLine = (vi % 2u) == 0u;
let d = lineData[col];
let viewRangeY = u.viewMaxY - u.viewMinY;
let normBaseline = select(0.0, (bau.baseline - u.viewMinY) / viewRangeY, viewRangeY > 0.0001);
let baselineScreenY = 1.0 - normBaseline;
let viewRangeX = u.viewMaxX - u.viewMinX;
let leftBound = select(0.0, clamp((u.dataMinX - u.viewMinX) / viewRangeX, 0.0, 1.0), viewRangeX > 0.0001);
let rightBound = select(1.0, clamp((u.dataMaxX - u.viewMinX) / viewRangeX, 0.0, 1.0), viewRangeX > 0.0001);
var sx = clamp(d.screenX, leftBound, rightBound);
let midScreenY = (d.minScreenY + d.maxScreenY) * 0.5;
let lineNormY = 1.0 - midScreenY;
var py = select(baselineScreenY, midScreenY, onLine);
if (d.valid < 0.5 && vi > 0u) {
let prevCol = (vi - 1u) / 2u;
let pd = lineData[prevCol];
sx = clamp(pd.screenX, leftBound, rightBound);
let prevMidScreenY = (pd.minScreenY + pd.maxScreenY) * 0.5;
py = select(baselineScreenY, prevMidScreenY, (vi - 1u) % 2u == 0u);
}
let clipX = sx * 2.0 - 1.0;
let clipY = 1.0 - py * 2.0;
out.valid = d.valid;
out.lineNormY = lineNormY;
out.baselineNormY = normBaseline;
out.pos = vec4f(clipX, clipY, 0.0, 1.0);
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
if (in.valid < 0.5) { discard; }
let packedColor = select(bau.negativeColor, bau.positiveColor, in.lineNormY > in.baselineNormY);
let color = unpack4x8unorm(packedColor);
return vec4f(color.rgb, 0.8);
}
`;
