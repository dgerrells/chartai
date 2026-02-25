import { UNIFORM_STRUCT, COMPUTE_WG } from "./shared.ts";

const BOID_STATE = `struct BoidState { pos: vec2f, vel: vec2f, species: u32, _pad: u32 }`;

// ── Tunable simulation constants ──────────────────────────────────────────────

// Perception and sep radii are now dynamic (= 2×cellSize and SEP_RATIO×that).
// These constants only define the ratio between the two.
const PERCEPTION = 0.2; // reference unit — only the ratio to SEP_R matters
const SEP_R = PERCEPTION * 0.2; // separation kicks in at 70% of perception radius
const MAX_SPD = 0.0025; // constant boid speed per frame (data-space)
const TURN_RATE = 0.25; // fraction of heading change applied per frame (0=no turn, 1=instant)

// Flocking weights
const W_SEP = 0.1; // separation  — direct push, fraction of dynMaxSpd per neighbour
const W_ALIGN = 0.05; // alignment   — steer toward avg neighbour velocity
const W_COH = 0.02; // cohesion    — steer toward centre of mass
const W_NOISE = 0.15; // noise       — fraction of MAX_SPD added as random jitter

// Containment — inverse-square ellipse repulsion
const CONTAIN_STRENGTH = 0.003; // bW = dynMaxSpd × CONTAIN_STRENGTH (linear, like flocking weights)
const CONTAIN_PAD = 0.3; // unused by ellipse containment, kept for reference

// Spatial grid — dimensions only; origin and cell size are computed dynamically
// from the view uniforms each frame so the grid always covers the visible area.
const CLOSE_CELLS = 1; // ±cells to search; covers perception radius = 2×cellSize
export const GRID_W = 16;
export const GRID_H = 16;
export const MAX_PER_CELL = 16;

// ── Shared WGSL snippets ──────────────────────────────────────────────────────

const GRID_HELPERS = `
const GRID_W       = ${GRID_W}u;
const GRID_H       = ${GRID_H}u;
const MAX_PER_CELL = ${MAX_PER_CELL}u;
// Returns (cellX, cellY, gridMinX, gridMinY) sized to cover the padded view.
fn gridParams(vMinX: f32, vMaxX: f32, vMinY: f32, vMaxY: f32) -> vec4f {
  let cX = (vMaxX - vMinX) * ${1 + CONTAIN_PAD}f / f32(GRID_W);
  let cY = (vMaxY - vMinY) * ${1 + CONTAIN_PAD}f / f32(GRID_H);
  return vec4f(cX, cY,
    (vMinX + vMaxX) * 0.5 - cX * f32(GRID_W) * 0.5,
    (vMinY + vMaxY) * 0.5 - cY * f32(GRID_H) * 0.5);
}
fn boidToCell(pos: vec2f, gp: vec4f) -> vec2i {
  return clamp(
    vec2i(i32((pos.x - gp.z) / gp.x), i32((pos.y - gp.w) / gp.y)),
    vec2i(0, 0), vec2i(i32(GRID_W) - 1, i32(GRID_H) - 1)
  );
}`;

// ── Init ──────────────────────────────────────────────────────────────────────

export const BOIDS_INIT_SHADER = `${UNIFORM_STRUCT}
${BOID_STATE}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> dataX: array<f32>;
@group(0) @binding(2) var<storage, read> dataY: array<f32>;
@group(0) @binding(3) var<storage, read_write> boidsState: array<BoidState>;
@group(0) @binding(4) var<uniform> seriesIdx: SeriesIndex;
fn hash2(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(q) * 43758.5453);
}
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u.pointCount) { return; }
  let b = boidsState[i];
  if (b.vel.x == 0.0 && b.vel.y == 0.0) {
    let seed = f32(seriesIdx.index * u.pointCount + i);
    let rPos = hash2(vec2f(seed * 0.1, 1.7));
    let rVel = hash2(vec2f(seed * 0.1, 0.5));
    let a = rVel.x * 6.28318;
    let spd = 0.002 + rVel.y * 0.003;
    boidsState[i] = BoidState(
      vec2f(rPos.x, rPos.y),
      vec2f(cos(a) * spd, sin(a) * spd),
      seriesIdx.index,
      0u
    );
  }
}`;

// ── Clear grid ────────────────────────────────────────────────────────────────

export const BOIDS_CLEAR_SHADER = `
${GRID_HELPERS}
@group(0) @binding(0) var<storage, read_write> gridCount: array<atomic<u32>>;
@compute @workgroup_size(${GRID_W * GRID_H})
fn main(@builtin(global_invocation_id) id: vec3u) {
  atomicStore(&gridCount[id.x], 0u);
}`;

// ── Insert into grid ──────────────────────────────────────────────────────────

export const BOIDS_INSERT_SHADER = `${UNIFORM_STRUCT}
${BOID_STATE}
${GRID_HELPERS}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> boidsState: array<BoidState>;
@group(0) @binding(2) var<storage, read_write> gridCount: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> gridBoids: array<u32>;
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u.pointCount) { return; }
  let gp   = gridParams(u.viewMinX, u.viewMaxX, u.viewMinY, u.viewMaxY);
  let gc   = boidToCell(boidsState[i].pos, gp);
  let cell = u32(gc.y * i32(GRID_W) + gc.x);
  let slot = atomicAdd(&gridCount[cell], 1u);
  if (slot < MAX_PER_CELL) {
    gridBoids[cell * MAX_PER_CELL + slot] = i;
  }
}`;

// ── Simulate ──────────────────────────────────────────────────────────────────

export const BOIDS_SIM_SHADER = `${UNIFORM_STRUCT}
${BOID_STATE}
${GRID_HELPERS}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read_write> boidsState: array<BoidState>;
@group(0) @binding(2) var<uniform> seriesIdx: SeriesIndex;
@group(0) @binding(3) var<storage, read> gridCount: array<u32>;
@group(0) @binding(4) var<storage, read> gridBoids: array<u32>;
fn hash2(p: vec2f) -> vec2f { let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3))); return fract(sin(q) * 43758.5453); }
@compute @workgroup_size(${COMPUTE_WG})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u.pointCount) { return; }
  let me = boidsState[i];

  // Speed scales up when zoomed out, floor at MAX_SPD when zoomed in.
  let viewRange = (u.viewMaxX - u.viewMinX + u.viewMaxY - u.viewMinY) * 0.5;
  let dynMaxSpd = ${MAX_SPD} * max(viewRange, 1.0);

  // Grid covers the padded view — params are the same in INSERT and SIM this frame.
  let gp       = gridParams(u.viewMinX, u.viewMaxX, u.viewMinY, u.viewMaxY);
  let cellSize = min(gp.x, gp.y); // perception radius = 2×cellSize (isotropic, safe with min)
  let dynPer   = cellSize * 2.0;
  let dynSep   = dynPer * ${SEP_R / PERCEPTION};
  let perSq    = dynPer * dynPer;
  let sepSq    = dynSep * dynSep;

  var sep     = vec2f(0.0);
  var align   = vec2f(0.0);
  var coh     = vec2f(0.0);
  var sameCnt = 0u;

  // 5×5 grid neighbourhood — ±CLOSE_CELLS covers the full perception radius.
  let lookahead = me.pos + me.vel;
  let gc = boidToCell(me.pos, gp);
  for (var dy = -${CLOSE_CELLS}; dy <= ${CLOSE_CELLS}; dy++) {
    for (var dx = -${CLOSE_CELLS}; dx <= ${CLOSE_CELLS}; dx++) {
      let nx = gc.x + dx;
      let ny = gc.y + dy;
      if (nx < 0 || nx >= i32(GRID_W) || ny < 0 || ny >= i32(GRID_H)) { continue; }
      let cell = u32(ny * i32(GRID_W) + nx);
      let cnt  = min(gridCount[cell], MAX_PER_CELL);
      let base = cell * MAX_PER_CELL;
      for (var s = 0u; s < cnt; s++) {
        let j = gridBoids[base + s];
        if (j == i) { continue; }
        let o   = boidsState[j];
        let d   = o.pos - lookahead;
        let dSq = dot(d, d);
        if (dSq < perSq && dSq > 1e-10) {
          sameCnt += 1u;
          if (dSq < sepSq) {
            sep -= d / dSq; // d/dSq = d/(dist²), no sqrt needed
          }
          align += o.vel;
          coh   += o.pos;
        }
      }
    }
  }

  var accel = vec2f(0.0);
  if (sameCnt > 0u) {
    let fc = f32(sameCnt);

    let sepMag = length(sep);
    if (sepMag > 1e-9) {
      accel += (sep / sepMag) * dynMaxSpd * ${W_SEP};
    }

    let avgVel = align / fc;
    let avgSpd = length(avgVel);
    if (avgSpd > 1e-9) {
      accel += (avgVel / avgSpd * dynMaxSpd - me.vel) * ${W_ALIGN};
    }

    let toCenter    = coh / fc - me.pos;
    let toCenterLen = length(toCenter);
    if (toCenterLen > 1e-9) {
      accel += (toCenter / toCenterLen * dynMaxSpd - me.vel) * ${W_COH};
    }
  }

  let n = hash2(me.pos * 150.0 + vec2f(f32(i) * 0.013, 0.0));
  accel += (n - 0.5) * (dynMaxSpd * ${W_NOISE});

  // Rounded-square containment via a superellipse (L4 norm).
  // p=4 gives flat sides with soft corners; raise the exponent for sharper corners.
  let cx   = (u.viewMinX + u.viewMaxX) * 0.5;
  let cy   = (u.viewMinY + u.viewMaxY) * 0.5;
  let ax   = (u.viewMaxX - u.viewMinX) * 0.5 * (1.0 + ${CONTAIN_PAD});
  let ay   = (u.viewMaxY - u.viewMinY) * 0.5 * (1.0 + ${CONTAIN_PAD});
  let ex   = (me.pos.x - cx) / ax;
  let ey   = (me.pos.y - cy) / ay;
  let er   = pow(ex*ex*ex*ex + ey*ey*ey*ey, 0.25); // L4 distance; 1.0 = boundary
  let edge = max(1.0 - er, 1e-4);
  let bW   = dynMaxSpd * ${CONTAIN_STRENGTH};
  let maxB = dynMaxSpd * 1.5;
  let fMag = clamp(bW / (edge * edge), 0.0, maxB);
  // Inward normal of the L4 superellipse: -(ex³, ey³) direction, scaled to data space.
  let gx   = ex * ex * ex / ax;
  let gy   = ey * ey * ey / ay;
  let gLen = max(sqrt(gx*gx + gy*gy), 1e-8);
  accel   -= vec2f(gx, gy) / gLen * fMag;

  let curLen  = length(me.vel);
  let curDir  = select(vec2f(1.0, 0.0), me.vel / curLen, curLen > 1e-12);
  let desired = me.vel + accel;
  let desLen  = length(desired);
  let desDir  = select(curDir, desired / desLen, desLen > 1e-12);
  let vel     = normalize(mix(curDir, desDir, ${TURN_RATE})) * dynMaxSpd;

  boidsState[i] = BoidState(me.pos + vel, vel, me.species, 0u);
}`;

// ── Render ────────────────────────────────────────────────────────────────────

export const BOIDS_RENDER_SHADER = `${UNIFORM_STRUCT}
${BOID_STATE}
struct BoidUniforms { radius: f32, _p0: u32, _p1: u32, _p2: u32 }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> boidsState: array<BoidState>;
@group(0) @binding(2) var<storage, read> allSeries: array<SeriesInfo>;
@group(0) @binding(3) var<uniform> seriesIdx: SeriesIndex;
@group(0) @binding(4) var<uniform> bu: BoidUniforms;
struct VertexOutput { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var out: VertexOutput;
  out.uv = vec2f(0.0); out.color = vec4f(0.0); out.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  let boidIdx = vi / 6u;
  if (boidIdx >= u.pointCount) { return out; }
  let vtxInQuad = vi % 6u;
  let b = boidsState[boidIdx];
  let series = allSeries[seriesIdx.index];
  let rx = u.viewMaxX - u.viewMinX;
  let ry = u.viewMaxY - u.viewMinY;
  if (rx < 1e-5 || ry < 1e-5) { return out; }
  let normX = (b.pos.x - u.viewMinX) / rx;
  let normY = (b.pos.y - u.viewMinY) / ry;
  let clipX = normX * 2.0 - 1.0;
  let clipY = normY * 2.0 - 1.0;
  let zoomScale = clamp(pow(1.0 / min(max(rx, 1e-5), max(ry, 1e-5)), 0.5), 0.25, 12.0);
  let r = max(3.0, bu.radius * zoomScale);
  var corners = array<vec2f, 6>(
    vec2f(-r,  r), vec2f( r,  r), vec2f(-r, -r),
    vec2f(-r, -r), vec2f( r,  r), vec2f( r, -r)
  );
  let p = corners[vtxInQuad];
  out.pos   = vec4f(clipX + p.x * 2.0 / u.width, clipY + p.y * 2.0 / u.height, 0.0, 1.0);
  out.uv    = p;
  out.color = series.color;
  return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
  let rx = u.viewMaxX - u.viewMinX;
  let ry = u.viewMaxY - u.viewMinY;
  let zoomScale = clamp(pow(1.0 / min(max(rx, 1e-5), max(ry, 1e-5)), 0.5), 0.25, 12.0);
  let r = max(3.0, bu.radius * zoomScale);
  let d = length(in.uv);
  if (d > r) { discard; }
  let alpha    = 1.0 - smoothstep(r * 0.85, r, d);
  // Soft ring: blend from the fill colour toward a darker shade of the same hue.
  let ringT    = smoothstep(r * 0.60, r * 0.88, d);
  let darkCol  = in.color.rgb * 0.40;
  let col      = mix(in.color.rgb, darkCol, ringT * 0.55);
  return vec4f(col, alpha);
}
`;
