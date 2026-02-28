import { UNIFORM_STRUCT } from "../shared.ts";

export { CANDLESTICK_COMPUTE_SHADER as OHLC_COMPUTE_SHADER } from "../candlestick.ts";

// Duplicated from candlestick.ts (not exported there)
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

// 3 sections × 6 vertices = 18 vertices per bar (triangle-list)
// Section 0: vertical wick (high-low range)
// Section 1: open tick (horizontal rect extending left from center)
// Section 2: close tick (horizontal rect extending right from center)
export const OHLC_RENDER_SHADER = `${UNIFORM_STRUCT}
${CANDLE_TYPES}
@group(0) @binding(0) var<uniform>       u:          Uniforms;
@group(0) @binding(1) var<storage, read> candleData: array<CandleData>;
@group(0) @binding(2) var<uniform>       cu:         CandleUniforms;
${EFFECTIVE_INTERVAL}
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) @interpolate(flat) isUp: f32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
var out: VertexOutput;
let viewRangeX = u.viewMaxX - u.viewMinX;
let interval   = effectiveInterval();
let numBins    = min(u32(ceil(viewRangeX / interval)) + 2u, u32(u.width));
let colIdx     = vi / 18u;
let localVi    = vi % 18u;
let section    = localVi / 6u;
let vertexType = localVi % 6u;
if (colIdx >= numBins) {
  out.pos = vec4f(0.0, 0.0, 0.0, 0.0); out.isUp = 0.0; return out;
}
let cd = candleData[colIdx];
if (cd.barWidth <= 0.0) {
  out.pos = vec4f(0.0, 0.0, 0.0, 0.0); out.isUp = 0.0; return out;
}
out.isUp = cd.isUp;
let viewRangeY = u.viewMaxY - u.viewMinY;
let safeRangeY = select(viewRangeY, 1.0, viewRangeY < 0.0001);
let onePixelX  = 1.0 / u.width;
let onePixelY  = 1.0 / u.height;
let wickWidth  = max(onePixelX, cd.barWidth * 0.07);
let tickHalfH  = max(onePixelY, wickWidth * u.width / u.height);
// isUp > 0.5: close >= open → bodyBottom = open, bodyTop = close
// isUp <= 0.5: close < open → bodyBottom = close, bodyTop = open
let openPrice  = select(cd.bodyTop,    cd.bodyBottom, cd.isUp > 0.5);
let closePrice = select(cd.bodyBottom, cd.bodyTop,    cd.isUp > 0.5);
var sLeft: f32; var sRight: f32; var sTop: f32; var sBottom: f32;
if (section == 0u) {
  // Vertical wick: spans low to high
  let nb = (cd.low  - u.viewMinY) / safeRangeY;
  let nt = (cd.high - u.viewMinY) / safeRangeY;
  sBottom = 1.0 - nb; sTop = 1.0 - nt;
  sLeft = cd.screenX - wickWidth; sRight = cd.screenX + wickWidth;
} else if (section == 1u) {
  // Open tick: horizontal rect extending LEFT from center
  let ny = (openPrice - u.viewMinY) / safeRangeY;
  let sy = 1.0 - ny;
  sTop = sy - tickHalfH; sBottom = sy + tickHalfH;
  sLeft  = cd.screenX - cd.barWidth * 0.45;
  sRight = cd.screenX;
} else {
  // Close tick: horizontal rect extending RIGHT from center
  let ny = (closePrice - u.viewMinY) / safeRangeY;
  let sy = 1.0 - ny;
  sTop = sy - tickHalfH; sBottom = sy + tickHalfH;
  sLeft  = cd.screenX;
  sRight = cd.screenX + cd.barWidth * 0.45;
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
let color   = select(downRgb, upRgb, in.isUp > 0.5);
return vec4f(color, 0.92);
}
`;
