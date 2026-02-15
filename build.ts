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
  
  // Move plugin .d.ts files from subdirectory to root
  const pluginDir = path.join(DIST, "plugins");
  if (fs.existsSync(pluginDir)) {
    for (const f of fs.readdirSync(pluginDir)) {
      if (f.endsWith(".d.ts") || f.endsWith(".d.ts.map")) {
        const src = path.join(pluginDir, f);
        const dest = path.join(DIST, f);
        fs.renameSync(src, dest);
      }
    }
    fs.rmSync(pluginDir, { recursive: true, force: true });
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

  // Readable build (splitting enables async shader chunks)
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

  // Move plugins from subdirectory to root
  const pluginDir = path.join(DIST, "plugins");
  if (fs.existsSync(pluginDir)) {
    for (const f of fs.readdirSync(pluginDir)) {
      const src = path.join(pluginDir, f);
      const dest = path.join(DIST, f);
      fs.renameSync(src, dest);
    }
    fs.rmSync(pluginDir, { recursive: true });
  }

  // Rename .js → .min.js and move to dist/
  for (const name of [
    "chart-library.js",
    "gpu-worker.js",
    "hover.js",
    "labels.js",
    "zoom.js",
  ]) {
    const minName = name.replace(".js", ".min.js");
    const src = path.join(minDir, name);
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(DIST, minName));
    } else {
      // Check if it's in a plugins subdirectory in minDir
      const pluginSrc = path.join(
        minDir,
        "plugins",
        name.split("/").pop() || name,
      );
      if (fs.existsSync(pluginSrc)) {
        fs.renameSync(pluginSrc, path.join(DIST, minName));
      }
    }
  }
  // Move any remaining files from minDir/plugins to dist/
  const minPluginDir = path.join(minDir, "plugins");
  if (fs.existsSync(minPluginDir)) {
    for (const f of fs.readdirSync(minPluginDir)) {
      const src = path.join(minPluginDir, f);
      const dest = path.join(DIST, f.replace(".js", ".min.js"));
      if (!fs.existsSync(dest)) fs.renameSync(src, dest);
    }
  }
  for (const f of fs.readdirSync(minDir)) {
    const src = path.join(minDir, f);
    const dest = path.join(DIST, f);
    if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
      fs.renameSync(src, dest);
    }
  }
  fs.rmSync(minDir, { recursive: true });

  const files = [
    "chart-library.js",
    "chart-library.min.js",
    "gpu-worker.js",
    "gpu-worker.min.js",
    "hover.js",
    "hover.min.js",
    "labels.js",
    "labels.min.js",
    "zoom.js",
    "zoom.min.js",
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
