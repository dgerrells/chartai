export type ZoomMode = "both" | "x-only" | "y-only" | "none";

export type BlendFactor =
  | "zero" | "one"
  | "src" | "one-minus-src"
  | "src-alpha" | "one-minus-src-alpha"
  | "dst" | "one-minus-dst"
  | "dst-alpha" | "one-minus-dst-alpha"
  | "src-alpha-saturated"
  | "constant" | "one-minus-constant";

export type BlendOperation = "add" | "subtract" | "reverse-subtract" | "min" | "max";

export interface BlendComponent {
  srcFactor?: BlendFactor;
  dstFactor?: BlendFactor;
  operation?: BlendOperation;
}

export interface BlendState {
  color: BlendComponent;
  alpha: BlendComponent;
}

export interface ChartColor { r: number; g: number; b: number; }

export interface ChartSeries {
  label: string;
  color: ChartColor | string;
  x: number[];
  y: number[];
  hidden?: boolean;
  [key: string]: any;
}

export interface HoverData {
  x: number;
  y: number;
  index: number;
  screenX: number;
  screenY: number;
  seriesIndex: number;
  seriesLabel: string;
}

export interface RenderContext {
  width: number;
  height: number;
  samples: number;
  seriesCount: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  view: { panX: number; panY: number; zoomX: number; zoomY: number };
}

export interface BindingDef {
  binding: number;
  source: string;
  write?: boolean;
}

export interface PassDef {
  type: "compute" | "render";
  shader: string;
  bindings: BindingDef[];
  perSeries?: boolean;
  dispatch?: (ctx: RenderContext) => { x: number; y?: number; z?: number };
  topology?: string;
  loadOp?: "clear" | "load";
  blend?: BlendState;
  draw?: (ctx: RenderContext) => number;
}

export type BufferUsage = "STORAGE" | "VERTEX" | "UNIFORM" | "INDEX" | "INDIRECT" | "COPY_SRC" | "COPY_DST";

export interface BufferDef {
  name: string;
  bytes: (ctx: RenderContext) => number;
  usages: BufferUsage[];
}

export interface UniformDef {
  name: string;
  type: "f32" | "u32";
  default: number;
}

export interface PassMeta {
  dispatch?: { x: number; y?: number; z?: number };
  draw?: number;
}

export interface ChartConfig {
  type: string;
  container: HTMLElement;
  series: ChartSeries[];
  defaultBounds?: { minX?: number; maxX?: number; minY?: number; maxY?: number };
  bgColor?: [number, number, number];
  hiddenSeries?: Set<number>;
}

// Augmented by renderer modules (e.g. `declare module "../types.ts" { interface ChartTypeRegistry { line: LineConfig } }`)
// Drives typed autocomplete on manager.create({ type: "line", ... }) with no explicit generic needed.
export interface ChartTypeRegistry {}

// Augmented by plugin modules. All registered plugin configs are merged as optional fields
// on every manager.create() call — so users get autocomplete for any installed plugin's options.
export interface ChartPluginRegistry {}

// Utility: collapses a union of object types into an intersection (A | B | C → A & B & C).
export type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

// All registered plugin config fields merged as optional. Empty when no plugins are imported.
export type AllPluginOptions = keyof ChartPluginRegistry extends never
  ? {}
  : Partial<UnionToIntersection<ChartPluginRegistry[keyof ChartPluginRegistry]>>;

export interface ChartStats {
  fps: number;
  renderMs: number;
  total: number;
  active: number;
}

export interface InternalChart<C extends ChartConfig = ChartConfig> {
  id: string;
  config: C;
  el: HTMLElement;
  backCanvas: HTMLCanvasElement;
  frontCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  series: Array<{
    label: string;
    color: { r: number; g: number; b: number };
    rawX: number[];
    rawY: number[];
    extra: Record<string, number[]>;
  }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  view: { panX: number; panY: number; zoomX: number; zoomY: number };
  homeView: { panX: number; panY: number; zoomX: number; zoomY: number };
  visible: boolean;
  dragging: boolean;
  plugins: ChartPlugin<any>[];
  renderer: RendererPlugin;
  customUniforms: Record<string, number>;
}

export interface ChartPlugin<C extends object = object> {
  name: string;
  install?(chart: InternalChart<ChartConfig & C>, el: HTMLElement): void;
  uninstall?(chart: InternalChart<ChartConfig & C>): void;
  resetView?(chart: InternalChart<ChartConfig & C>): void;
  beforeDraw?(ctx: CanvasRenderingContext2D, chart: InternalChart<ChartConfig & C>): void;
  afterDraw?(ctx: CanvasRenderingContext2D, chart: InternalChart<ChartConfig & C>): void;
}

export interface RendererPlugin {
  name: string;
  shaders: Record<string, string>;
  passes: PassDef[];
  buffers?: BufferDef[];
  uniforms?: UniformDef[];
  computeBounds?(series: Array<{ rawX: number[]; rawY: number[]; extra: Record<string, number[]> }>): { minX: number; maxX: number; minY: number; maxY: number };
  install?(chart: InternalChart<any>, el: HTMLElement): void;
  uninstall?(chart: InternalChart<any>): void;
}
