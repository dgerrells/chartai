import path from "path";
import fs from "fs";

const PORT = 8092;
const PUBLIC_DIR = import.meta.dir;

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let requestedPath = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, "");

    if (requestedPath === "/") {
      requestedPath = "/index.html";
    }

    let filePath = path.join(PUBLIC_DIR, requestedPath);

    // Security check
    if (!filePath.startsWith(PUBLIC_DIR)) {
      return new Response("Forbidden", { status: 403 });
    }

    // If .js is requested but doesn't exist, try .ts
    if (requestedPath.endsWith(".js") && !fs.existsSync(filePath)) {
      const tsPath = filePath.replace(/\.js$/, ".ts");
      if (fs.existsSync(tsPath)) {
        filePath = tsPath;
      }
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const headers = new Headers();

      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".ts": "application/javascript",
        ".json": "application/json",
      };

      if (mimeTypes[ext]) {
        headers.set("Content-Type", mimeTypes[ext]);
      }

      // Transpile TypeScript
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
});

console.log(`
🧪 Integration Test running at http://localhost:${PORT}
📁 Serving from: ${PUBLIC_DIR}
`);
