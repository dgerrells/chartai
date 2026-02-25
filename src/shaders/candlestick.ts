import { UNIFORM_STRUCT, BINARY_SEARCH, COMPUTE_WG } from "./shared.ts";

// Shared helpers embedded into both shaders
const CANDLE_TYPES = `
struct CandleUniforms {
  maxSamples: f32,
  upColor:    u32,
  downColor:  u32,
  binSize:    u32,
  interval:   f32,
  _p0: u32, _p1: u32, _p2: u32,
};
struct CandleData {
  screenX:    f32,
  barWidth:   f32,
  low:        f32,
  bodyBottom: f32,
  bodyTop:    f32,
  high:       f32,
  isUp:       f32,
};`;

// Returns the effective grouping interval in X-axis units.
// If cu.interval > 0 it is used directly; otherwise auto-selects the smallest
// standard timeframe that gives each candle at least cu.binSize screen pixels.
const EFFECTIVE_INTERVAL = `
fn effectiveInterval() -> f32 {
  if (cu.interval > 0.0) { return cu.interval; }
  let raw = (u.viewMaxX - u.viewMinX) / u.width * f32(cu.binSize);
  let steps = array<f32, 20>(
    1.0, 2.0, 5.0, 10.0, 15.0, 30.0,
    60.0, 120.0, 300.0, 600.0, 900.0, 1800.0,
    3600.0, 7200.0, 14400.0, 43200.0,
    86400.0, 259200.0, 604800.0, 2592000.0
  );
  for (var i = 0u; i < 20u; i++) {
    if (steps[i] >= raw) { return steps[i]; }
  }
  return raw;
}`;

export const CANDLESTICK_COMPUTE_SHADER = `${UNIFORM_STRUCT}
${CANDLE_TYPES}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read>       dataX:     array<f32>;
@group(0) @binding(2) var<storage, read>       dataClose: array<f32>;
@group(0) @binding(3) var<storage, read_write> candleData: array<CandleData>;
@group(0) @binding(4) var<storage, read>       allSeries: array<SeriesInfo>;
@group(0) @binding(5) var<uniform>             seriesIdx: SeriesIndex;
@group(0) @binding(6) var<uniform>             cu: CandleUniforms;
@group(0) @binding(7) var<storage, read>       dataOpen: array<f32>;
@group(0) @binding(8) var<storage, read>       dataHigh: array<f32>;
@group(0) @binding(9) var<storage, read>       dataLow:  array<f32>;
${BINARY_SEARCH}
${EFFECTIVE_INTERVAL}
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
let binIdx     = id.x;
let totalPixels = u32(u.width);
let count      = u.pointCount;
if (count == 0u) {
  if (binIdx < totalPixels) { candleData[binIdx] = CandleData(0.0,0.0,0.0,0.0,0.0,0.0,0.0); }
  return;
}
let viewRangeX = u.viewMaxX - u.viewMinX;
let viewRangeY = u.viewMaxY - u.viewMinY;
if (viewRangeX < 0.0001 || viewRangeY < 0.0001) {
  if (binIdx < totalPixels) { candleData[binIdx] = CandleData(0.0,0.0,0.0,0.0,0.0,0.0,0.0); }
  return;
}
let interval     = effectiveInterval();
let alignedStart = floor(u.viewMinX / interval) * interval;
let numBins      = min(u32(ceil(viewRangeX / interval)) + 2u, totalPixels);
if (binIdx >= numBins) { return; }
let binMinX = alignedStart + f32(binIdx) * interval;
let binMaxX = binMinX + interval;
if (binMinX >= u.viewMaxX) {
  candleData[binIdx] = CandleData(0.0,0.0,0.0,0.0,0.0,0.0,0.0);
  return;
}
let binMidX  = binMinX + interval * 0.5;
let screenX  = (binMidX - u.viewMinX) / viewRangeX;
let barWidth = interval / viewRangeX;
let onePixel = 1.0 / u.width;
let bw       = max(barWidth * 0.95, onePixel);
let startIdx = lowerBound(binMinX, count);
var endIdx   = lowerBound(binMaxX, count);
endIdx = min(endIdx, count);
if (startIdx >= endIdx) {
  // No data starts in this interval — find nearest candle that visually overlaps
  var bestIdx:  u32  = 0u;
  var bestDist: f32  = 1e10;
  var hit = false;
  if (startIdx < count) {
    let bx = dataX[startIdx];
    let hw = interval * 0.5;
    if (binMinX < bx + hw && binMaxX > bx - hw) {
      bestIdx = startIdx; bestDist = abs(bx - binMidX); hit = true;
    }
  }
  if (startIdx > 0u) {
    let prev = startIdx - 1u;
    let bx   = dataX[prev];
    let hw   = interval * 0.5;
    if (binMinX < bx + hw && binMaxX > bx - hw) {
      let d = abs(bx - binMidX);
      if (!hit || d < bestDist) { bestIdx = prev; }
      hit = true;
    }
  }
  if (!hit) {
    candleData[binIdx] = CandleData(0.0,0.0,0.0,0.0,0.0,0.0,0.0);
    return;
  }
  let o = dataOpen[bestIdx];
  let h = dataHigh[bestIdx];
  let l = dataLow[bestIdx];
  let c = dataClose[bestIdx];
  candleData[binIdx] = CandleData(screenX, bw, l, min(o,c), max(o,c), h, select(0.0,1.0,c>=o));
  return;
}
// Aggregate OHLC across all data points in this interval
let o        = dataOpen[startIdx];
var h        = dataHigh[startIdx];
var l        = dataLow[startIdx];
let c        = dataClose[endIdx - 1u];
let rangeCount  = endIdx - startIdx;
let maxSamples  = u32(cu.maxSamples);
if (maxSamples > 0u && rangeCount > maxSamples) {
  let stride = f32(rangeCount - 1u) / f32(maxSamples - 1u);
  for (var s = 0u; s < maxSamples; s++) {
    let idx = startIdx + u32(f32(s) * stride);
    if (idx < endIdx) { h = max(h, dataHigh[idx]); l = min(l, dataLow[idx]); }
  }
  h = max(h, dataHigh[endIdx - 1u]);
  l = min(l, dataLow[endIdx - 1u]);
} else {
  for (var i = startIdx; i < endIdx; i++) {
    h = max(h, dataHigh[i]); l = min(l, dataLow[i]);
  }
}
candleData[binIdx] = CandleData(screenX, bw, l, min(o,c), max(o,c), h, select(0.0,1.0,c>=o));
}
`;

export const CANDLESTICK_RENDER_SHADER = `${UNIFORM_STRUCT}
${CANDLE_TYPES}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> candleData: array<CandleData>;
@group(0) @binding(2) var<uniform>       cu: CandleUniforms;
${EFFECTIVE_INTERVAL}
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) @interpolate(flat) isUp:   f32,
@location(1) @interpolate(flat) isWick: f32,
};
// 5 sections × 6 vertices = 30 per column
// 0=body  1=upper-wick  2=lower-wick  3=upper-cap  4=lower-cap
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
var out: VertexOutput;
let viewRangeX = u.viewMaxX - u.viewMinX;
let interval   = effectiveInterval();
let numBins    = min(u32(ceil(viewRangeX / interval)) + 2u, u32(u.width));
let colIdx     = vi / 30u;
let localVi    = vi % 30u;
let section    = localVi / 6u;
let vertexType = localVi % 6u;
if (colIdx >= numBins) {
  out.pos = vec4f(0.0,0.0,0.0,0.0); out.isUp = 0.0; out.isWick = 0.0; return out;
}
let cd = candleData[colIdx];
if (cd.barWidth <= 0.0) {
  out.pos = vec4f(0.0,0.0,0.0,0.0); out.isUp = 0.0; out.isWick = 0.0; return out;
}
out.isUp   = cd.isUp;
out.isWick = select(0.0, 1.0, section > 0u);
let viewRangeY = u.viewMaxY - u.viewMinY;
let safeRangeY = select(viewRangeY, 1.0, viewRangeY < 0.0001);
let onePixelX  = 1.0 / u.width;
let onePixelY  = 1.0 / u.height;
var sLeft: f32; var sRight: f32; var sTop: f32; var sBottom: f32;
if (section == 0u) {
  let nb = (cd.bodyBottom - u.viewMinY) / safeRangeY;
  let nt = (cd.bodyTop    - u.viewMinY) / safeRangeY;
  sBottom = 1.0 - nb; sTop = 1.0 - nt;
  let hw = cd.barWidth * 0.5;
  sLeft = cd.screenX - hw; sRight = cd.screenX + hw;
} else if (section == 1u) {
  let nb = (cd.bodyTop - u.viewMinY) / safeRangeY;
  let nt = (cd.high    - u.viewMinY) / safeRangeY;
  sBottom = 1.0 - nb; sTop = 1.0 - nt;
  let hw = max(onePixelX, cd.barWidth * 0.08);
  sLeft = cd.screenX - hw; sRight = cd.screenX + hw;
} else if (section == 2u) {
  let nb = (cd.low        - u.viewMinY) / safeRangeY;
  let nt = (cd.bodyBottom - u.viewMinY) / safeRangeY;
  sBottom = 1.0 - nb; sTop = 1.0 - nt;
  let hw = max(onePixelX, cd.barWidth * 0.08);
  sLeft = cd.screenX - hw; sRight = cd.screenX + hw;
} else if (section == 3u) {
  let sy     = 1.0 - (cd.high - u.viewMinY) / safeRangeY;
  let wickHW = max(onePixelX, cd.barWidth * 0.08);
  let capHH  = wickHW * u.width / u.height;
  sTop = sy - capHH; sBottom = sy + capHH;
  let hw = max(onePixelX * 2.0, cd.barWidth * 0.28);
  sLeft = cd.screenX - hw; sRight = cd.screenX + hw;
} else {
  let sy     = 1.0 - (cd.low - u.viewMinY) / safeRangeY;
  let wickHW = max(onePixelX, cd.barWidth * 0.08);
  let capHH  = wickHW * u.width / u.height;
  sTop = sy - capHH; sBottom = sy + capHH;
  let hw = max(onePixelX * 2.0, cd.barWidth * 0.28);
  sLeft = cd.screenX - hw; sRight = cd.screenX + hw;
}
var positions = array<vec2f, 6>(
  vec2f(sLeft,  sBottom),
  vec2f(sRight, sBottom),
  vec2f(sLeft,  sTop),
  vec2f(sLeft,  sTop),
  vec2f(sRight, sBottom),
  vec2f(sRight, sTop)
);
let sp = positions[vertexType];
out.pos = vec4f(sp.x * 2.0 - 1.0, 1.0 - sp.y * 2.0, 0.0, 1.0);
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
let upRgb   = unpack4x8unorm(cu.upColor).rgb;
let downRgb = unpack4x8unorm(cu.downColor).rgb;
let base  = select(downRgb, upRgb, in.isUp > 0.5);
let color = select(base, base * 0.65, in.isWick > 0.5);
return vec4f(color, 0.92);
}
`;
