// Shared WGSL snippets and constants injected into all chart shaders

export const COMPUTE_WG = 256;

export const UNIFORM_STRUCT = `struct Uniforms {
width: f32,
height: f32,
viewMinX: f32,
viewMaxX: f32,
viewMinY: f32,
viewMaxY: f32,
pointCount: u32,
seriesCount: u32,
isDark: u32,
bgR: f32,
bgG: f32,
bgB: f32,
dataMinX: f32,
dataMaxX: f32,
dataMinY: f32,
dataMaxY: f32,
};
struct SeriesInfo {
color: vec4f,
visibleRange: vec2u,
_pad0: f32,
_pad1: f32,
};
struct SeriesIndex {
index: u32,
_pad0: u32,
_pad1: u32,
_pad2: u32,
};
`;

export const BINARY_SEARCH = `fn lowerBound(val: f32, count: u32) -> u32 {
var lo = 0u;
var hi = count;
while (lo < hi) {
let mid = (lo + hi) / 2u;
if (dataX[mid] < val) {
lo = mid + 1u;
} else {
hi = mid;
}
}
return lo;
}
`;

// Luma-based AA blit shader.
export const BLIT_SHADER = `fn luma(c:vec4f)->f32{return dot(c.rgb,vec3f(.299,.587,.114));}
fn laaa(uv:vec2f,t:texture_2d<f32>,s:sampler)->vec4f{
let r=1./vec2f(textureDimensions(t));let m=textureSample(t,s,uv);
let n=textureSample(t,s,uv+vec2f(0.,-r.y));let e=textureSample(t,s,uv+vec2f(r.x,0.));
let w=textureSample(t,s,uv+vec2f(-r.x,0.));let sv=textureSample(t,s,uv+vec2f(0.,r.y));
let lm=luma(m);let ln=luma(n);let le=luma(e);let lw=luma(w);let ls=luma(sv);
let lo=min(lm,min(min(ln,ls),min(le,lw)));let hi=max(lm,max(max(ln,ls),max(le,lw)));
let rng=hi-lo;if(rng<max(.0833,hi*.166)){return m;}
return mix(m,(m+n+e+w+sv)*.2,min(rng*3.,1.));}
struct BV{@builtin(position)p:vec4f,@location(0)uv:vec2f}
@group(0)@binding(0)var inputTex:texture_2d<f32>;
@group(0)@binding(1)var samp:sampler;
@vertex fn vs(@builtin(vertex_index)i:u32)->BV{
var p=array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
var u=array<vec2f,4>(vec2f(0,1),vec2f(1,1),vec2f(0,0),vec2f(1,0));
return BV(vec4f(p[i],0,1),u[i]);}
@fragment fn fs(v:BV)->@location(0)vec4f{return laaa(v.uv,inputTex,samp);}
`;
