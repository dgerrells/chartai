import path from "path";
import fs from "fs";

const PORT = 8092;
const PUBLIC_DIR = import.meta.dir;
const ENTRY_FILE = path.join(PUBLIC_DIR, "main.ts");
const OUT_DIR = path.join(PUBLIC_DIR, ".dist");
const BUNDLE_PATH = path.join(OUT_DIR, "bundle.js");

// Create output directory
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

let bundledCode = "";
let isBuilding = false;

// Build function
async function build() {
  if (isBuilding) return;
  isBuilding = true;
  
  const startTime = performance.now();
  console.log("🔨 Building...");
  
  try {
    const result = await Bun.build({
      entrypoints: [ENTRY_FILE],
      outdir: OUT_DIR,
      format: "esm",
      target: "browser",
      splitting: false,
      minify: false,
      sourcemap: "inline",
    });

    if (result.success) {
      // Read the bundled output
      bundledCode = await Bun.file(path.join(OUT_DIR, "main.js")).text();
      const buildTime = (performance.now() - startTime).toFixed(2);
      console.log(`✅ Built successfully in ${buildTime}ms`);
    } else {
      console.error("❌ Build failed:", result.logs);
    }
  } catch (error) {
    console.error("❌ Build error:", error);
  } finally {
    isBuilding = false;
  }
}

// Initial build
await build();

// Watch for changes
const watcher = fs.watch(PUBLIC_DIR, { recursive: true }, async (event, filename) => {
  if (filename && (filename.endsWith(".ts") || filename.endsWith(".js"))) {
    console.log(`📝 File changed: ${filename}`);
    await build();
  }
});

// HTTP Server
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let requestedPath = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, "");

    // Serve the bundle
    if (requestedPath === "/bundle.js") {
      return new Response(bundledCode, {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Serve index.html for root
    if (requestedPath === "/") {
      requestedPath = "/index.html";
    }

    const filePath = path.join(PUBLIC_DIR, requestedPath);

    // Security check
    if (!filePath.startsWith(PUBLIC_DIR)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Serve static files
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
      };

      const file = Bun.file(filePath);
      const headers = new Headers();
      if (mimeTypes[ext]) {
        headers.set("Content-Type", mimeTypes[ext]);
      }

      return new Response(file, { headers });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`
🧪 Integration Test running at http://localhost:${PORT}
📦 Bundling: ${ENTRY_FILE}
👀 Watching for changes...
`);
