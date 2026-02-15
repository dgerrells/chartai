import path from "path";
import fs from "fs";

const ROOT = import.meta.dir;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
// GitHub Pages only serves from a folder named "docs/" — that's why it's called docs
const PAGES = path.join(ROOT, "docs");

const mode = process.argv[2] ?? "all";

function fileSize(f: string) {
  return `${path.basename(f)}: ${(fs.statSync(f).size / 1024).toFixed(1)} KB`;
}

async function generateTypes() {
  console.log("📝 Generating TypeScript declarations...");
  const result = Bun.spawnSync([
    "bun",
    "x",
    "tsc",
    "--project",
    path.join(ROOT, "tsconfig.json"),
  ]);
  
  if (result.exitCode !== 0) {
    console.error("❌ Type generation failed:");
    console.error(result.stderr.toString());
    process.exit(1);
  }
  
  // Remove shaders .d.ts files (internal only, not part of public API)
  const shadersDir = path.join(DIST, "shaders");
  if (fs.existsSync(shadersDir)) {
    fs.rmSync(shadersDir, { recursive: true, force: true });
  }
  
  console.log("✅ Type declarations generated");
}

// Bun plugin to minify shader code during bundling
const shaderMinifierPlugin = {
  name: "shader-minifier",
  setup(build: any) {
    build.onLoad({ filter: /shaders\/.*\.ts$/ }, async (args: any) => {
      const source = await Bun.file(args.path).text();
      
      // Minify shader template strings
      const minified = source.replace(
        /(export const \w+ = `)([^`]+)(`)/g,
        (match, prefix, shader, suffix) => {
          let minifiedShader = shader;
          // Remove single-line comments (// ...)
          minifiedShader = minifiedShader.replace(/\/\/.*$/gm, "");
          // Remove multi-line comments (/* ... */)
          minifiedShader = minifiedShader.replace(/\/\*[\s\S]*?\*\//g, "");
          // Remove leading/trailing whitespace from each line
          minifiedShader = minifiedShader.replace(/^[ \t]+|[ \t]+$/gm, "");
          // Collapse all newlines to spaces (keeps WGSL valid, just removes line breaks)
          minifiedShader = minifiedShader.replace(/\n+/g, " ");
          // Remove extra spaces (multiple spaces become single space)
          minifiedShader = minifiedShader.replace(/ +/g, " ");
          // Remove spaces around brackets, parens, semicolons, and commas (safe in WGSL)
          minifiedShader = minifiedShader.replace(/ *([{}();,]) */g, "$1");
          // Trim the final result
          minifiedShader = minifiedShader.trim();
          
          return prefix + minifiedShader + suffix;
        }
      );
      
      return {
        contents: minified,
        loader: "ts",
      };
    });
  },
};

// Bun plugin to resolve absolute paths starting with /src/ during bundling
const absolutePathResolverPlugin = {
  name: "absolute-path-resolver",
  setup(build: any) {
    build.onResolve({ filter: /^\/src\// }, (args: any) => {
      // Convert /src/... to ROOT/src/...
      const resolved = path.join(ROOT, args.path);
      return { path: resolved };
    });
  },
};

// ---------------------------------------------------------------------------
// build:lib — standalone library bundle → dist/
//   Outputs both readable (.js) and minified (.min.js) versions.
//   No CSS — the library is pure JS + WebGPU, no stylesheets needed.
// ---------------------------------------------------------------------------
async function buildLib() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const entries = [
    path.join(SRC, "chart-library.ts"),
    path.join(SRC, "gpu-worker.ts"),
    path.join(SRC, "plugins/hover.ts"),
    path.join(SRC, "plugins/labels.ts"),
    path.join(SRC, "plugins/zoom.ts"),
  ];

  // Readable build (splitting enables code reuse and smaller bundles)
  const readable = await Bun.build({
    entrypoints: entries,
    outdir: DIST,
    format: "esm",
    minify: false,
    splitting: true,
    plugins: [shaderMinifierPlugin],
  });
  if (!readable.success) {
    console.error("❌ build failed:", readable.logs);
    process.exit(1);
  }

  // Minified build → .min.js
  const minDir = path.join(DIST, "_min");
  fs.mkdirSync(minDir, { recursive: true });
  const minified = await Bun.build({
    entrypoints: entries,
    outdir: minDir,
    format: "esm",
    minify: true,
    splitting: true,
    plugins: [shaderMinifierPlugin],
  });
  if (!minified.success) {
    console.error("❌ minified build failed:", minified.logs);
    process.exit(1);
  }

  // Rename minified files: .js → .min.js and copy to dist/
  function copyMinified(dir: string, outDir: string) {
    for (const item of fs.readdirSync(dir)) {
      const srcPath = path.join(dir, item);
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        const newOutDir = path.join(outDir, item);
        fs.mkdirSync(newOutDir, { recursive: true });
        copyMinified(srcPath, newOutDir);
      } else if (item.endsWith(".js")) {
        const minName = item.replace(".js", ".min.js");
        const destPath = path.join(outDir, minName);
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  copyMinified(minDir, DIST);
  fs.rmSync(minDir, { recursive: true });

  const files = [
    "chart-library.js",
    "chart-library.min.js",
    "gpu-worker.js",
    "gpu-worker.min.js",
    "plugins/hover.js",
    "plugins/hover.min.js",
    "plugins/labels.js",
    "plugins/labels.min.js",
    "plugins/zoom.js",
    "plugins/zoom.min.js",
  ]
    .map((f) => path.join(DIST, f))
    .filter((f) => fs.existsSync(f))
    .map((f) => `  ${fileSize(f)}`);
  console.log(`✅ dist/\n${files.join("\n")}`);
  
  // Generate TypeScript declarations
  await generateTypes();
}

// ---------------------------------------------------------------------------
// build:pages — compile the demo into docs/ so GitHub Pages can host it
// ---------------------------------------------------------------------------
async function buildPages() {
  fs.rmSync(PAGES, { recursive: true, force: true });
  fs.mkdirSync(PAGES, { recursive: true });

  // Bundle main.ts (pulls in chart-library)
  const main = await Bun.build({
    entrypoints: [path.join(ROOT, "pages", "main.ts")],
    outdir: PAGES,
    format: "esm",
    minify: true,
    plugins: [shaderMinifierPlugin],
  });
  if (!main.success) {
    console.error("❌ main build failed:", main.logs);
    process.exit(1);
  }

  // Bundle the worker (splitting = async shader chunks)
  const worker = await Bun.build({
    entrypoints: [path.join(SRC, "gpu-worker.ts")],
    outdir: PAGES,
    format: "esm",
    minify: true,
    splitting: true,
    plugins: [shaderMinifierPlugin],
  });
  if (!worker.success) {
    console.error("❌ worker build failed:", worker.logs);
    process.exit(1);
  }

  // Copy CSS (demo needs it for the UI shell)
  fs.copyFileSync(path.join(ROOT, "pages", "chart.css"), path.join(PAGES, "chart.css"));

  // Copy index.html with paths fixed for compiled output
  let html = fs.readFileSync(path.join(ROOT, "pages", "index.html"), "utf-8");
  html = html.replace('src="/main.ts"', 'src="./main.js"');
  html = html.replace('href="/chart.css"', 'href="./chart.css"');
  fs.writeFileSync(path.join(PAGES, "index.html"), html);

  console.log("✅ docs/  (GitHub Pages ready)");
}

// ---------------------------------------------------------------------------
// buildCanvasDemo — compile the canvas demo to docs/canvas/
// ---------------------------------------------------------------------------
async function buildCanvasDemo() {
  const CANVAS_OUT = path.join(PAGES, "canvas");
  fs.mkdirSync(CANVAS_OUT, { recursive: true });

  // Bundle the canvas demo's main.ts
  const canvasMain = await Bun.build({
    entrypoints: [path.join(ROOT, "demos", "canvas", "src", "main.ts")],
    outdir: CANVAS_OUT,
    format: "esm",
    minify: true,
    plugins: [absolutePathResolverPlugin, shaderMinifierPlugin],
  });
  if (!canvasMain.success) {
    console.error("❌ canvas demo build failed:", canvasMain.logs);
    process.exit(1);
  }

  // Bundle the worker (splitting = async shader chunks)
  const canvasWorker = await Bun.build({
    entrypoints: [path.join(SRC, "gpu-worker.ts")],
    outdir: CANVAS_OUT,
    format: "esm",
    minify: true,
    splitting: true,
    plugins: [shaderMinifierPlugin],
  });
  if (!canvasWorker.success) {
    console.error("❌ canvas worker build failed:", canvasWorker.logs);
    process.exit(1);
  }

  // Copy CSS
  fs.copyFileSync(
    path.join(ROOT, "demos", "canvas", "src", "canvas.css"),
    path.join(CANVAS_OUT, "canvas.css")
  );

  // Copy index.html with paths fixed for compiled output
  let html = fs.readFileSync(
    path.join(ROOT, "demos", "canvas", "src", "index.html"),
    "utf-8"
  );
  html = html.replace('src="/demos/canvas/src/main.ts"', 'src="./main.js"');
  html = html.replace('href="/demos/canvas/src/canvas.css"', 'href="./canvas.css"');
  fs.writeFileSync(path.join(CANVAS_OUT, "index.html"), html);

  console.log("✅ docs/canvas/  (Canvas demo ready)");
}

// ---------------------------------------------------------------------------
if (mode === "lib") {
  await buildLib();
} else if (mode === "pages") {
  // Pages build requires lib to be built first
  await buildLib();
  await buildPages();
  await buildCanvasDemo();
} else {
  await buildLib();
  await buildPages();
  await buildCanvasDemo();
}
