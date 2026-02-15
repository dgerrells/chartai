import path from "path";
import fs from "fs";

const PORT = 8091;
const PUBLIC_DIR = import.meta.dir;

// WebSocket connections for hot reload
const clients = new Set<ServerWebSocket<unknown>>();

// Watch for file changes
const watcher = fs.watch(PUBLIC_DIR, { recursive: true }, (event, filename) => {
  if (filename) {
    console.log(`📁 ${event}: ${filename}`);
    // Notify all connected clients to reload
    for (const client of clients) {
      client.send("reload");
    }
  }
});

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade for hot reload
    if (url.pathname === "/__hot") {
      if (server.upgrade(req)) {
        return;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    let requestedPath = path
      .normalize(url.pathname)
      .replace(/^(\.\.[\/\\])+/, "");

    if (requestedPath === "/") {
      requestedPath = "/pages/index.html";
    }
    
    // Redirect root files to pages directory
    if (requestedPath === "/main.ts") {
      requestedPath = "/pages/main.ts";
    }
    if (requestedPath === "/chart.css") {
      requestedPath = "/pages/chart.css";
    }

    let filePath = path.join(PUBLIC_DIR, requestedPath);

    // Security check
    if (!filePath.startsWith(PUBLIC_DIR)) {
      return new Response("Forbidden", { status: 403 });
    }
    
    // If .js is requested but doesn't exist, try .ts (for bundled imports)
    if (requestedPath.endsWith(".js") && !fs.existsSync(filePath)) {
      const tsPath = filePath.replace(/\.js$/, ".ts");
      if (fs.existsSync(tsPath)) {
        filePath = tsPath;
      }
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const headers = new Headers();

      // Set content type based on extension
      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".ts": "application/javascript",
        ".wgsl": "text/plain",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
      };

      if (mimeTypes[ext]) {
        headers.set("Content-Type", mimeTypes[ext]);
      }

      // Handle TypeScript files - transpile on the fly
      if (ext === ".ts") {
        const source = fs.readFileSync(filePath, "utf-8");
        const transpiler = new Bun.Transpiler({ loader: "ts" });
        const js = transpiler.transformSync(source);
        headers.set("Content-Type", "application/javascript");
        return new Response(js, { headers });
      }

      const file = Bun.file(filePath);
      return new Response(file, { headers });
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log("🔌 Hot reload client connected");
    },
    close(ws) {
      clients.delete(ws);
      console.log("🔌 Hot reload client disconnected");
    },
    message() {},
  },
});

console.log(`
🚀 WebGPU Playground running at http://localhost:${PORT}
📁 Serving from: ${PUBLIC_DIR}
🔥 Hot reload enabled
`);

// Cleanup on exit
process.on("SIGINT", () => {
  watcher.close();
  process.exit(0);
});
