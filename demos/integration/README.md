# Integration Test Demo

This demo tests the ChartAI library imported directly from npm, ensuring all exports work correctly.

## Setup

```bash
cd demos/integration

# Install chartai from npm
npm install

# Start dev server
npm run dev
```

Then open: **http://localhost:8092**

## What It Tests

- ✅ Main library import (`chartai`)
- ✅ Worker import resolution
- ✅ Plugin imports (`chartai/plugins/*`)
- ✅ TypeScript types
- ✅ WebGPU initialization
- ✅ Chart creation (scatter, line, bar)
- ✅ Series updates
- ✅ Zoom modes
- ✅ Theme switching
- ✅ Sync views
- ✅ Point size changes
- ✅ Stats callbacks
- ✅ Chart destruction
- ✅ All 14 core API methods

## How It Works

The demo imports `chartai` as a real npm package dependency. Before publishing, use `npm link` to create a symlink from your local build to test the exact same behavior as if it were installed from the npm registry.
