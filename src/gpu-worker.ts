// @ts-nocheck

import { COMPUTE_WG, FXAA_RENDER_SHADER } from "./shaders/shared.ts";
import { LINE_COMPUTE_SHADER, LINE_RENDER_SHADER } from "./shaders/line.ts";
import { SCATTER_COMPUTE_SHADER } from "./shaders/scatter.ts";
import { BOX_COMPUTE_SHADER, BOX_RENDER_SHADER } from "./shaders/box.ts";

type ChartType = "scatter" | "line" | "box";

interface ChartSeriesData {
  label: string;
  colorR: number;
  colorG: number;
  colorB: number;
  dataX: GPUBuffer;
  dataY: GPUBuffer;
  lineBuffer: GPUBuffer | null;
  seriesIndexBuffer: GPUBuffer | null;
  pointCount: number;
  visibleStart: number;
  visibleCount: number;
  computeBindGroup: GPUBindGroup | null;
  renderBindGroup: GPUBindGroup | null;
}

interface Chart {
  id: string;
  canvas: OffscreenCanvas;
  ctx: GPUCanvasContext;
  type: ChartType;
  visible: boolean;
  pointSize: number;
  maxSamplesPerPixel: number;
  series: ChartSeriesData[];
  uniformBuffer: GPUBuffer;
  seriesStorageBuffer: GPUBuffer | null;
  outputTexture: GPUTexture | null;
  outputTextureView: GPUTextureView | null;
  fxaaBindGroup: GPUBindGroup | null;
  width: number;
  height: number;
  panX: number;
  panY: number;
  zoomX: number;
  zoomY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  bgColor: [number, number, number] | null;
  dirty: boolean;
}

let device: GPUDevice, canvasFormat: GPUTextureFormat;
const charts = new Map<string, Chart>();
let isDark = false;

// Shared Bind Group Layouts
let layouts: Record<string, GPUBindGroupLayout> = {};
let pipelines: Record<string, any> = {};
let frameCount = 0;
let lastRenderMs = 0;
let renderScheduled = false;
let statsInterval: ReturnType<typeof setInterval> | null = null;

// staging buffers
const uniformStagingBuffer = new ArrayBuffer(112);
const uniformStagingF32 = new Float32Array(uniformStagingBuffer);
const uniformStagingU32 = new Uint32Array(uniformStagingBuffer);

// Cached sampler for FXAA
let fxaaSampler: GPUSampler;

const writeAllSeriesData = (chart: Chart, perSeriesPointSize?: number[]) => {
  if (!chart.seriesStorageBuffer || chart.series.length === 0) return;
  const data = new Float32Array(chart.series.length * 8);
  const dataU32 = new Uint32Array(data.buffer);

  for (let i = 0; i < chart.series.length; i++) {
    const s = chart.series[i];
    const offset = i * 8;

    // vec4f color
    data[offset + 0] = s.colorR;
    data[offset + 1] = s.colorG;
    data[offset + 2] = s.colorB;
    data[offset + 3] = 1.0; // Alpha

    // vec2u visibleRange
    dataU32[offset + 4] = s.visibleStart;
    dataU32[offset + 5] = s.visibleCount;

    // f32 pointSize
    data[offset + 6] = perSeriesPointSize?.[i] ?? chart.pointSize;
    data[offset + 7] = 0.0; // padding
  }

  device.queue.writeBuffer(chart.seriesStorageBuffer, 0, data);
};

/** Uniform Packing: Syncs GPU side variables with Chart state */
const writeUniforms = (
  chart: Chart,
  series: ChartSeriesData,
  seriesIndex: number,
  pointSize?: number,
) => {
  const f32 = uniformStagingF32;
  const u32 = uniformStagingU32;
  const rx = chart.maxX - chart.minX,
    ry = chart.maxY - chart.minY;
  const bg =
    chart.bgColor ?? (isDark ? [0.11, 0.11, 0.12] : [0.98, 0.98, 0.98]);

  f32.set(
    [
      chart.width,
      chart.height,
      chart.minX + chart.panX * rx,
      chart.minX + chart.panX * rx + rx / chart.zoomX,
      chart.minY + chart.panY * ry,
      chart.minY + chart.panY * ry + ry / chart.zoomY,
    ],
    0,
  );

  u32[6] = series.pointCount;
  f32.set(
    [
      isDark ? 1 : 0,
      ...bg,
      pointSize ?? chart.pointSize,
      chart.minY,
      chart.maxY,
      chart.minX,
      chart.maxX,
    ],
    7,
  );
  u32[16] = series.visibleStart;
  u32[17] = series.visibleCount;
  u32[18] = 0; // dispatchXCount (updated per scatter series)
  u32[19] = chart.maxSamplesPerPixel;
  u32[20] = chart.series.length;

  device.queue.writeBuffer(chart.uniformBuffer, 0, uniformStagingBuffer);
};

const createChartPipeline = (
  name: string,
  cShader: string,
  rShader: string,
  topology: GPUPrimitiveTopology,
  blend?: GPUBlendState,
) => {
  const cMod = device.createShaderModule({ code: cShader }),
    rMod = device.createShaderModule({ code: rShader });

  pipelines[`${name}Compute`] = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [layouts[`${name}Compute`]],
    }),
    compute: { module: cMod, entryPoint: "main" },
  });

  // Line/Box render to intermediate texture (rgba8unorm), not canvas
  pipelines[`${name}Render`] = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [layouts[`${name}Render`]],
    }),
    vertex: { module: rMod, entryPoint: "vs" },
    fragment: {
      module: rMod,
      entryPoint: "fs",
      targets: [{ format: "rgba8unorm", blend }],
    },
    primitive: { topology },
  });
};

async function init(): Promise<boolean> {
  if (device) return true;

  if (!navigator.gpu) {
    postMessage({ type: "error", message: "WebGPU not supported" });
    return false;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    postMessage({ type: "error", message: "No GPU adapter found" });
    return false;
  }

  device = await adapter.requestDevice({
    requiredLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    },
  });
  canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  device.lost.then((info) => {
    postMessage({
      type: "error",
      message: `GPU device lost: ${info.reason} - ${info.message}`,
    });
  });

  createPipelines();

  postMessage({ type: "gpu-ready" });
  return true;
}

function createPipelines() {
  // layouts
  layouts.lineCompute = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
    ],
  });

  layouts.lineRender = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
    ],
  });

  layouts.scatterCompute = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
  });

  layouts.fxaaRender = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float" },
      },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  layouts.boxCompute = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
  });

  // Box render reuses line render layout (same structure)
  layouts.boxRender = layouts.lineRender;

  // Create pipelines using factory with alpha blending for intermediate texture
  createChartPipeline(
    "line",
    LINE_COMPUTE_SHADER,
    LINE_RENDER_SHADER,
    "line-list",
    {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
    },
  );
  createChartPipeline(
    "box",
    BOX_COMPUTE_SHADER,
    BOX_RENDER_SHADER,
    "triangle-list",
    {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
    },
  );

  const scatterComputeModule = device.createShaderModule({
    code: SCATTER_COMPUTE_SHADER,
  });
  pipelines.scatterCompute = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [layouts.scatterCompute],
    }),
    compute: { module: scatterComputeModule, entryPoint: "main" },
  });

  const fxaaRenderModule = device.createShaderModule({
    code: FXAA_RENDER_SHADER,
  });
  pipelines.fxaaRender = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [layouts.fxaaRender],
    }),
    vertex: { module: fxaaRenderModule, entryPoint: "vs" },
    fragment: {
      module: fxaaRenderModule,
      entryPoint: "fs",
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: "triangle-strip" },
  });

  // fxaa sampler
  fxaaSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });
}

function createChart(
  id: string,
  canvas: OffscreenCanvas,
  type: ChartType,
  pointSize: number = 3,
  maxSamplesPerPixel: number = 0,
  bgColor: [number, number, number] | null = null,
) {
  const ctx = device ? canvas.getContext("webgpu") : null;
  if (!ctx) {
    postMessage({
      type: "error",
      message: `Failed to initialize WebGPU context: ${id}`,
    });
    return;
  }

  try {
    ctx.configure({ device, format: canvasFormat, alphaMode: "premultiplied" });
  } catch (e) {
    postMessage({
      type: "error",
      message: `Failed to configure WebGPU context: ${id}`,
      err: e.toString(),
    });
    return;
  }

  const limit = device.limits.maxTextureDimension2D;
  const width = Math.min(Math.floor(Number(canvas.width) || 800), limit);
  const height = Math.min(Math.floor(Number(canvas.height) || 400), limit);

  const uniformBuffer = device.createBuffer({
    size: 112,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const chart: Chart = {
    id,
    canvas,
    ctx,
    type,
    visible: true,
    pointSize,
    maxSamplesPerPixel,
    series: [],
    uniformBuffer,
    seriesStorageBuffer: null,
    outputTexture: null,
    outputTextureView: null,
    fxaaBindGroup: null,
    width,
    height,
    panX: 0,
    panY: 0,
    zoomX: 1,
    zoomY: 1,
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1,
    bgColor,
    dirty: true,
  };

  try {
    createChartResources(chart);
  } catch (e) {
    postMessage({
      type: "error",
      message: `Cannot create chart ${id}: resource creation failed - ${e}`,
    });
    return;
  }
  charts.set(id, chart);
  postMessage({ type: "chart-registered", id });
}

function createChartResources(chart: Chart) {
  if (chart.outputTexture) chart.outputTexture.destroy();

  const w = Math.max(1, chart.width);
  const h = Math.max(1, chart.height);

  // All chart types use intermediate texture for FXAA rendering
  const usage =
    chart.type === "scatter"
      ? GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT
      : GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;

  chart.outputTexture = device.createTexture({
    size: [w, h],
    format: "rgba8unorm",
    usage,
  });
  chart.outputTextureView = chart.outputTexture.createView();
  chart.fxaaBindGroup = device.createBindGroup({
    layout: layouts.fxaaRender,
    entries: [
      { binding: 0, resource: { buffer: chart.uniformBuffer } },
      { binding: 1, resource: chart.outputTextureView },
      { binding: 2, resource: fxaaSampler },
    ],
  });
}

function buildSeriesBindGroups(
  chart: Chart,
  series: ChartSeriesData,
  seriesIndex: number,
): void {
  if (!chart.seriesStorageBuffer) return;

  if (chart.type === "scatter") {
    if (series.seriesIndexBuffer) series.seriesIndexBuffer.destroy();
    series.seriesIndexBuffer = device.createBuffer({
      size: 16, // SeriesIndex struct: u32 + 3x padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const indexData = new Uint32Array([seriesIndex, 0, 0, 0]);
    device.queue.writeBuffer(series.seriesIndexBuffer, 0, indexData);

    series.computeBindGroup = device.createBindGroup({
      layout: layouts.scatterCompute,
      entries: [
        { binding: 0, resource: { buffer: chart.uniformBuffer } },
        { binding: 1, resource: { buffer: series.dataX } },
        { binding: 2, resource: { buffer: series.dataY } },
        { binding: 3, resource: chart.outputTextureView! },
        { binding: 4, resource: { buffer: chart.seriesStorageBuffer } },
        { binding: 5, resource: { buffer: series.seriesIndexBuffer } },
      ],
    });
  } else {
    // Line/Box: create line buffer and bind groups
    const computeLayout =
      chart.type === "line" ? layouts.lineCompute : layouts.boxCompute;
    const renderLayout =
      chart.type === "line" ? layouts.lineRender : layouts.boxRender;

    if (series.lineBuffer) series.lineBuffer.destroy();
    series.lineBuffer = device.createBuffer({
      size: chart.width * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });

    if (chart.type === "box") {
      if (series.seriesIndexBuffer) series.seriesIndexBuffer.destroy();
      series.seriesIndexBuffer = device.createBuffer({
        size: 16, // SeriesIndex struct: u32 + 3x padding
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const indexData = new Uint32Array([seriesIndex, 0, 0, 0]);
      device.queue.writeBuffer(series.seriesIndexBuffer, 0, indexData);
    }

    const computeEntries = [
      { binding: 0, resource: { buffer: chart.uniformBuffer } },
      { binding: 1, resource: { buffer: series.dataX } },
      { binding: 2, resource: { buffer: series.dataY } },
      { binding: 3, resource: { buffer: series.lineBuffer } },
      { binding: 4, resource: { buffer: chart.seriesStorageBuffer } },
    ];

    if (chart.type === "box" && series.seriesIndexBuffer) {
      computeEntries.push({
        binding: 5,
        resource: { buffer: series.seriesIndexBuffer },
      });
    }

    series.computeBindGroup = device.createBindGroup({
      layout: computeLayout,
      entries: computeEntries,
    });

    series.renderBindGroup = device.createBindGroup({
      layout: renderLayout,
      entries: [
        { binding: 0, resource: { buffer: chart.uniformBuffer } },
        { binding: 1, resource: { buffer: series.lineBuffer } },
        { binding: 2, resource: { buffer: chart.seriesStorageBuffer } },
      ],
    });
  }
}

function resizeChart(chart: Chart, width: number, height: number) {
  if (width === chart.width && height === chart.height) return;
  if (width <= 0 || height <= 0) return;

  chart.width = width;
  chart.height = height;
  chart.canvas.width = width;
  chart.canvas.height = height;

  try {
    createChartResources(chart);
    for (let i = 0; i < chart.series.length; i++) {
      buildSeriesBindGroups(chart, chart.series[i], i);
    }
  } catch (e) {
    postMessage({
      type: "error",
      message: `resize failed for chart ${chart.id}: ${e}`,
    });
  }
}

function updateSeries(
  id: string,
  seriesData: Array<{
    label: string;
    colorR: number;
    colorG: number;
    colorB: number;
    dataX: Float32Array;
    dataY: Float32Array;
  }>,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const chart = charts.get(id);
  if (!chart || !device) {
    if (!chart)
      postMessage({
        type: "error",
        message: `update-series failed: chart ${id} not found`,
      });
    return;
  }

  try {
    chart.minX = bounds.minX;
    chart.maxX = bounds.maxX;
    chart.minY = bounds.minY;
    chart.maxY = bounds.maxY;

    // Clean up old series buffers
    for (const s of chart.series) {
      s.dataX.destroy();
      s.dataY.destroy();
      if (s.lineBuffer) s.lineBuffer.destroy();
      if (s.seriesIndexBuffer) s.seriesIndexBuffer.destroy();
    }
    chart.series = [];

    // Create/recreate series storage buffer (8 floats per series)
    if (chart.seriesStorageBuffer) chart.seriesStorageBuffer.destroy();
    if (seriesData.length > 0) {
      chart.seriesStorageBuffer = device.createBuffer({
        size: Math.max(32, seriesData.length * 32), // 32 bytes per SeriesInfo
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    // Create buffers and bind groups for each series
    for (const sd of seriesData) {
      const dataX = device.createBuffer({
        size: Math.max(16, sd.dataX.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      const dataY = device.createBuffer({
        size: Math.max(16, sd.dataY.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      device.queue.writeBuffer(dataX, 0, sd.dataX);
      device.queue.writeBuffer(dataY, 0, sd.dataY);

      const series: ChartSeriesData = {
        label: sd.label,
        colorR: sd.colorR,
        colorG: sd.colorG,
        colorB: sd.colorB,
        dataX,
        dataY,
        lineBuffer: null,
        seriesIndexBuffer: null,
        pointCount: sd.dataX.length,
        visibleStart: 0,
        visibleCount: sd.dataX.length,
        computeBindGroup: null,
        renderBindGroup: null,
      };

      chart.series.push(series);
    }

    for (let i = 0; i < chart.series.length; i++) {
      buildSeriesBindGroups(chart, chart.series[i], i);
    }

    postMessage({ type: "bounds-update", id, ...bounds });
  } catch (e) {
    postMessage({
      type: "error",
      message: `update-series failed for chart ${id}: ${e}`,
    });
  }
}

function render(chart: Chart) {
  if (!chart.ctx) return;
  if (chart.width === 0 || chart.height === 0) return;
  if (chart.series.length === 0) return;

  let textureView: GPUTextureView;
  try {
    textureView = chart.ctx.getCurrentTexture().createView();
  } catch {
    return;
  }

  // fxaa is cheap
  renderChartWithFXAA(chart, textureView);
}

function renderChartWithFXAA(chart: Chart, textureView: GPUTextureView) {
  const encoder = device.createCommandEncoder();

  let perSeriesPointSizes: number[] | undefined;
  if (chart.type === "scatter") {
    const canvasArea = chart.width * chart.height;
    const budget = canvasArea * 4;
    perSeriesPointSizes = chart.series.map((s) => {
      const visCount = Math.max(1, s.visibleCount);
      const pixelsPerPoint = Math.PI * chart.pointSize * chart.pointSize;
      if (visCount * pixelsPerPoint > budget) {
        return Math.max(1, Math.sqrt(budget / (visCount * Math.PI)));
      }
      return chart.pointSize;
    });
  }

  writeAllSeriesData(chart, perSeriesPointSizes);

  if (chart.series.length > 0) {
    writeUniforms(chart, chart.series[0], 0);
  }

  const clearPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: chart.outputTextureView!,
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      },
    ],
  });
  clearPass.end();

  // Run all compute passes first
  for (let seriesIndex = 0; seriesIndex < chart.series.length; seriesIndex++) {
    const series = chart.series[seriesIndex];
    if (series.pointCount === 0) continue;

    if (chart.type === "scatter") {
      const MAX_WG_DIM = 65535;
      const totalWG = Math.ceil(series.visibleCount / COMPUTE_WG);
      const wgX = Math.min(totalWG, MAX_WG_DIM);
      const wgY = Math.ceil(totalWG / MAX_WG_DIM);
      const dispatchBuf = new Uint32Array([wgX * COMPUTE_WG]);
      device.queue.writeBuffer(chart.uniformBuffer, 72, dispatchBuf);

      const computePass = encoder.beginComputePass();
      computePass.setPipeline(pipelines.scatterCompute);
      computePass.setBindGroup(0, series.computeBindGroup!);
      computePass.dispatchWorkgroups(wgX, wgY);
      computePass.end();
    } else {
      writeUniforms(chart, series, seriesIndex);

      const computePipeline =
        chart.type === "line" ? pipelines.lineCompute : pipelines.boxCompute;

      const computePass = encoder.beginComputePass();
      computePass.setPipeline(computePipeline);
      computePass.setBindGroup(0, series.computeBindGroup!);
      computePass.dispatchWorkgroups(Math.ceil(chart.width / COMPUTE_WG));
      computePass.end();
    }
  }

  // For line/box charts: single render pass with multiple draw calls
  if (chart.type !== "scatter") {
    const renderPipeline =
      chart.type === "line" ? pipelines.lineRender : pipelines.boxRender;
    const drawCount =
      chart.type === "line"
        ? Math.max(0, chart.width * 4 - 2)
        : chart.width * 6;

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: chart.outputTextureView!,
          loadOp: "load",
          storeOp: "store",
        },
      ],
    });

    // Set pipeline once for all series
    renderPass.setPipeline(renderPipeline);

    // Draw all series in a single render pass
    for (
      let seriesIndex = 0;
      seriesIndex < chart.series.length;
      seriesIndex++
    ) {
      const series = chart.series[seriesIndex];
      if (series.pointCount === 0) continue;

      // Only update bind group per series
      renderPass.setBindGroup(0, series.renderBindGroup!);
      renderPass.draw(drawCount, 1, 0, seriesIndex);
    }

    renderPass.end();
  }

  // fxaa
  const fxaaPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      },
    ],
  });
  fxaaPass.setPipeline(pipelines.fxaaRender);

  if (chart.fxaaBindGroup) {
    fxaaPass.setBindGroup(0, chart.fxaaBindGroup);
  }
  fxaaPass.draw(4);
  fxaaPass.end();

  // submit all
  device.queue.submit([encoder.finish()]);
}

function scheduleRender() {
  if (!renderScheduled) {
    renderScheduled = true;
    requestAnimationFrame(renderFrame);
  }
}

function markDirty(chart: Chart) {
  chart.dirty = true;
  if (chart.visible) scheduleRender();
}

function markAllDirty() {
  let anyVisible = false;
  for (const chart of charts.values()) {
    chart.dirty = true;
    if (chart.visible) anyVisible = true;
  }
  if (anyVisible) scheduleRender();
}

function countActiveCharts(): number {
  let n = 0;
  for (const chart of charts.values()) {
    if (chart.visible && chart.width > 0) n++;
  }
  return n;
}

function startStats() {
  if (statsInterval !== null) return;
  statsInterval = setInterval(() => {
    postMessage({
      type: "stats",
      fps: frameCount,
      renderMs: lastRenderMs,
      totalCharts: charts.size,
      activeCharts: countActiveCharts(),
    });
    frameCount = 0;
  }, 1000);
}

function renderFrame() {
  renderScheduled = false;

  const t0 = performance.now();

  for (const chart of charts.values()) {
    if (chart.visible && chart.dirty && chart.width > 0) {
      render(chart);
      chart.dirty = false;
    }
  }

  lastRenderMs = performance.now() - t0;
  frameCount++;
}

// Message handler
self.onmessage = async (e: MessageEvent) => {
  const { type, ...data } = e.data;

  switch (type) {
    case "init":
      isDark = data.isDark || false;
      if (await init()) {
        startStats();
      }
      break;

    case "theme":
      isDark = data.isDark;
      markAllDirty();
      break;

    case "register-chart":
      createChart(
        data.id,
        data.canvas,
        data.chartType || "scatter",
        data.pointSize ?? 3,
        data.maxSamplesPerPixel ?? 100,
        data.bgColor ?? null,
      );
      {
        const chart = charts.get(data.id);
        if (chart) markDirty(chart);
      }
      break;

    case "unregister-chart": {
      const chart = charts.get(data.id);
      if (chart) {
        try {
          chart.ctx.unconfigure();
        } catch {}
        chart.uniformBuffer.destroy();
        if (chart.seriesStorageBuffer) chart.seriesStorageBuffer.destroy();
        if (chart.outputTexture) chart.outputTexture.destroy();
        for (const s of chart.series) {
          s.dataX.destroy();
          s.dataY.destroy();
          if (s.lineBuffer) s.lineBuffer.destroy();
          if (s.seriesIndexBuffer) s.seriesIndexBuffer.destroy();
        }
        charts.delete(data.id);
      }
      postMessage({ type: "chart-unregistered", id: data.id });
      break;
    }

    case "set-point-size": {
      const chart = charts.get(data.id);
      if (chart) {
        chart.pointSize = Math.max(1, Math.min(8, data.pointSize));
        markDirty(chart);
      }
      break;
    }

    case "set-max-samples": {
      const chart = charts.get(data.id);
      if (chart) {
        chart.maxSamplesPerPixel = Math.max(0, data.maxSamplesPerPixel | 0);
        markDirty(chart);
      }
      break;
    }

    case "set-style": {
      const chart = charts.get(data.id);
      if (chart) {
        if (data.bgColor !== undefined) chart.bgColor = data.bgColor;
        markDirty(chart);
      }
      break;
    }

    case "update-series": {
      updateSeries(data.id, data.series, data.bounds);
      const chart = charts.get(data.id);
      if (chart) markDirty(chart);
      break;
    }

    case "set-visibility": {
      const chart = charts.get(data.id);
      if (chart) {
        chart.visible = data.visible;
        if (data.visible && chart.dirty) scheduleRender();
      }
      break;
    }

    case "view-transform": {
      const chart = charts.get(data.id);
      if (chart) {
        chart.panX = data.panX;
        chart.panY = data.panY;
        chart.zoomX = Math.max(0.1, Math.min(1000000, data.zoomX));
        chart.zoomY = Math.max(0.1, Math.min(1000000, data.zoomY));
        markDirty(chart);
      }
      break;
    }

    case "resize": {
      const chart = charts.get(data.id);
      if (chart && data.width > 0 && data.height > 0) {
        resizeChart(chart, data.width, data.height);
        markDirty(chart);
      }
      break;
    }

    case "batch-view-transform": {
      const zX = Math.max(0.1, Math.min(1000000, data.zoomX));
      const zY = Math.max(0.1, Math.min(1000000, data.zoomY));
      for (const t of data.transforms) {
        const chart = charts.get(t.id);
        if (chart) {
          chart.panX = data.panX;
          chart.panY = data.panY;
          chart.zoomX = zX;
          chart.zoomY = zY;
          chart.dirty = true;
        }
      }
      scheduleRender();
      break;
    }

    case "sync-view":
      for (const chart of charts.values()) {
        chart.panX = data.panX;
        chart.panY = data.panY;
        chart.zoomX = data.zoomX;
        chart.zoomY = data.zoomY;
      }
      markAllDirty();
      break;
  }
};
