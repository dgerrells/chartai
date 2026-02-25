export const M = {
  // main → worker
  INIT: 0,
  THEME: 1,
  REGISTER_RENDERER: 2,
  REGISTER_CHART: 3,
  UNREGISTER_CHART: 4,
  UPDATE_SERIES: 5,
  RESIZE: 6,
  VIEW_TRANSFORM: 7,
  BATCH_VIEW_TRANSFORM: 8,
  SET_VISIBILITY: 9,
  SET_STYLE: 10,
  SET_UNIFORMS: 11,
  // worker → main
  GPU_READY: 12,
  ERROR: 13,
  STATS: 14,
} as const;

// Short error codes posted by the worker. Look up the prefix number in docs.
export const E = {
  NO_GPU: "e1:no-gpu",
  NO_ADAPTER: "e2:no-adapter",
  DEVICE_LOST: "e3:device-lost",
  NOT_READY: "e4:not-ready",
  COMPILE: "e5:compile",
  CTX_GET: "e6:ctx-get",
  CTX_CFG: "e7:ctx-cfg",
  TEX: "e8:tex",
  BIND_S: "e9:bind-s",
  BIND_C: "e10:bind-c",
  UPDATE: "e11:update",
  NO_RENDERER: "e12:no-renderer",
  RESIZE: "e13:resize",
} as const;
