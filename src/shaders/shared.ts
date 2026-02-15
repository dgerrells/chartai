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
isDark: f32,
bgR: f32,
bgG: f32,
bgB: f32,
pointRadius: f32,
dataMinY: f32,
dataMaxY: f32,
dataMinX: f32,
dataMaxX: f32,
visibleStart: u32,
visibleCount: u32,
dispatchXCount: u32,
maxSamplesPerPixel: u32,
seriesCount: u32,
_pad2: u32,
_pad3: u32,
_pad4: u32,
};
struct SeriesInfo {
color: vec4f,
visibleRange: vec2u,
pointSize: f32,
_pad: f32,
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

export const FXAA_SHADER = `fn l(c:vec4f)->f32{return dot(c.rgb,vec3f(.299,.587,.114))+c.a*.25;}
fn fxaa(u:vec2f,t:texture_2d<f32>,s:sampler)->vec4f{let r=1./vec2f(textureDimensions(t));let rM=textureSampleLevel(t,s,u,0.);let rN=textureSampleLevel(t,s,u+vec2f(0.,-r.y),0.);let rS=textureSampleLevel(t,s,u+vec2f(0.,r.y),0.);let rE=textureSampleLevel(t,s,u+vec2f(r.x,0.),0.);let rW=textureSampleLevel(t,s,u+vec2f(-r.x,0.),0.);let lM=l(rM);let lN=l(rN);let lS=l(rS);let lE=l(rE);let lW=l(rW);let mi=min(lM,min(min(lN,lS),min(lE,lW)));let ma=max(lM,max(max(lN,lS),max(lE,lW)));let ra=ma-mi;if(ra<max(.0833,ma*.166)){return rM;}let lNW=l(textureSampleLevel(t,s,u+vec2f(-r.x,-r.y),0.));let lNE=l(textureSampleLevel(t,s,u+vec2f(r.x,-r.y),0.));let lSW=l(textureSampleLevel(t,s,u+vec2f(-r.x,r.y),0.));let lSE=l(textureSampleLevel(t,s,u+vec2f(r.x,r.y),0.));let sB=min(.35,max(0.,abs((lN+lS+lE+lW)*.25-lM)/ra-.25)*1.33);let iH=abs(lNW+lNE-2.*lN)+abs(lW+lE-2.*lM)*2.+abs(lSW+lSE-2.*lS)>=abs(lNW+lSW-2.*lW)+abs(lN+lS-2.*lM)*2.+abs(lNE+lSE-2.*lE);let l1=select(lW,lN,iH);let l2=select(lE,lS,iH);let pD=abs(l2-lM)>abs(l1-lM);let sL=select(r.x,r.y,iH);let lA=.5*(select(l1,l2,pD)+lM);let gS=max(abs(l1-lM),abs(l2-lM))*.25;var eU=u;if(iH){eU.y+=select(-.5,.5,pD)*sL;}else{eU.x+=select(-.5,.5,pD)*sL;}let eS=select(vec2f(r.x,0.),vec2f(0.,r.y),iH);var uN=eU-eS;var uP=eU+eS;var eN=l(textureSampleLevel(t,s,uN,0.))-lA;var eP=l(textureSampleLevel(t,s,uP,0.))-lA;var dN=abs(eN)>=gS;var dP=abs(eP)>=gS;for(var i=1;i<8;i++){if(!dN){uN-=eS*1.5;eN=l(textureSampleLevel(t,s,uN,0.))-lA;dN=abs(eN)>=gS;}if(!dP){uP+=eS*1.5;eP=l(textureSampleLevel(t,s,uP,0.))-lA;dP=abs(eP)>=gS;}if(dN&&dP){break;}}let dtN=select(u.x-uN.x,u.y-uN.y,iH);let dtP=select(uP.x-u.x,uP.y-u.y,iH);let eB=select(0.,.5-min(dtN,dtP)/(dtN+dtP),(lM-lA<0.)!=(select(eP<0.,eN<0.,dtN<dtP)));var fU=u;let fL=max(eB,sB);if(iH){fU.y+=select(-1.,1.,pD)*fL*sL;}else{fU.x+=select(-1.,1.,pD)*fL*sL;}return textureSampleLevel(t,s,fU,0.);}
`;

export const FXAA_RENDER_SHADER = `${UNIFORM_STRUCT}
${FXAA_SHADER}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
struct VertexOutput {
@builtin(position) pos: vec4f,
@location(0) uv: vec2f,
};
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
var positions = array<vec2f, 4>(
vec2f(-1.0, -1.0),
vec2f(1.0, -1.0),
vec2f(-1.0, 1.0),
vec2f(1.0, 1.0)
);
var uvs = array<vec2f, 4>(
vec2f(0.0, 1.0),
vec2f(1.0, 1.0),
vec2f(0.0, 0.0),
vec2f(1.0, 0.0)
);
var out: VertexOutput;
out.pos = vec4f(positions[vi], 0.0, 1.0);
out.uv = uvs[vi];
return out;
}
@fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
return fxaa(in.uv, inputTex, samp);
}
`;
