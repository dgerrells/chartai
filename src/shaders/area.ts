import { UNIFORM_STRUCT } from "./shared.ts";

// Area chart: filled polygon under the line, reuses LineData from line compute
export const AREA_RENDER_SHADER = `${UNIFORM_STRUCT}
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
let onLine = (vi % 2u) == 0u;
let d = lineData[col];
let viewRangeY = u.viewMaxY - u.viewMinY;
let baseline = select(1.0, 1.0 - (u.dataMinY - u.viewMinY) / viewRangeY, viewRangeY > 0.0001);
let viewRangeX = u.viewMaxX - u.viewMinX;
let leftBound = select(0.0, clamp((u.dataMinX - u.viewMinX) / viewRangeX, 0.0, 1.0), viewRangeX > 0.0001);
let rightBound = select(1.0, clamp((u.dataMaxX - u.viewMinX) / viewRangeX, 0.0, 1.0), viewRangeX > 0.0001);
var sx = clamp(d.screenX, leftBound, rightBound);
var py = select(baseline, (d.minScreenY + d.maxScreenY) * 0.5, onLine);
if (d.valid < 0.5 && vi > 0u) {
let prevCol = (vi - 1u) / 2u;
let pd = lineData[prevCol];
sx = clamp(pd.screenX, leftBound, rightBound);
py = select(baseline, (pd.minScreenY + pd.maxScreenY) * 0.5, (vi - 1u) % 2u == 0u);
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
return vec4f(series.color.rgb, 1.0);
}
`;
