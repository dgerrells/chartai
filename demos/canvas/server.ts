import path from "path";
import fs from "fs";

const PORT = 8093;
// Serve from workspace root so both demo files and chart library are accessible
const ROOT = path.resolve(import.meta.dir, "../..");
const WATCH_DIR = path.join(import.meta.dir, "src");

const clients = new Set<ServerWebSocket<unknown>>();

const watcher = fs.watch(WATCH_DIR, { recursive: true }, (_event, filename) => {
  if (filename) {
    for (const client of clients) {
      client.send("reload");
    }
  }
});

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wgsl": "text/plain",
};

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // Hot-reload WebSocket
    if (url.pathname === "/__hot") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    let requestedPath = path
      .normalize(url.pathname)
      .replace(/^(\.\.[/\\])+/, "");

    // Default route → demo index
    if (requestedPath === "/") {
      requestedPath = "/demos/canvas/src/index.html";
    }

    // The chart library loads its worker from "/gpu-worker.ts" (absolute).
    // Redirect so the worker's own relative imports (./shaders/*) resolve correctly.
    if (requestedPath === "/gpu-worker.ts") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/src/gpu-worker.ts" },
      });
    }

    const filePath = path.join(ROOT, requestedPath.replace(/^\//, ""));

    // Security: stay within workspace
    if (!filePath.startsWith(ROOT)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const headers = new Headers();

      if (MIME[ext]) headers.set("Content-Type", MIME[ext]);

      // Transpile TypeScript on the fly
      if (ext === ".ts") {
        const source = fs.readFileSync(filePath, "utf-8");
        const transpiler = new Bun.Transpiler({ loader: "ts" });
        const js = transpiler.transformSync(source);
        headers.set("Content-Type", "application/javascript");
        return new Response(js, { headers });
      }

      return new Response(Bun.file(filePath), { headers });
    }

    // If .js is requested but doesn't exist, try .ts instead
    if (filePath.endsWith(".js")) {
      const tsPath = filePath.replace(/\.js$/, ".ts");
      if (fs.existsSync(tsPath) && fs.statSync(tsPath).isFile()) {
        const source = fs.readFileSync(tsPath, "utf-8");
        const transpiler = new Bun.Transpiler({ loader: "ts" });
        const js = transpiler.transformSync(source);
        const headers = new Headers();
        headers.set("Content-Type", "application/javascript");
        return new Response(js, { headers });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
    },
    close(ws) {
      clients.delete(ws);
    },
    message() {},
  },
});

console.log(
  `\n🚀 Canvas Demo → http://localhost:${PORT}\n📁 Workspace:  ${ROOT}\n🔥 Hot reload watching: ${WATCH_DIR}\n`,
);

process.on("SIGINT", () => {
  watcher.close();
  process.exit(0);
});
