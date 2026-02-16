# AGENTS.md - ChartAI Library Guide for AI Agents

This document provides guidance for AI agents working with the ChartAI library.

## Overview

ChartAI is a GPU-accelerated WebGPU chart library (~11kb) that renders millions of data points at 60fps using compute shaders. It supports line, scatter, and bar charts with passive rendering and automatic virtualization.

**Critical Requirements:**
- WebGPU support is mandatory (no fallback)
- Uses Web Workers for off-thread GPU computation
- Color values use 0-1 range (not 0-255)

## Core API Pattern

```js
import { ChartManager } from 'chartai';

// 1. Get singleton instance
const manager = ChartManager.getInstance();

// 2. Initialize (async, call once)
await manager.init();

// 3. Create chart (returns chartId string)
const chartId = manager.create({
  type: 'line',              // 'line' | 'scatter' | 'bar'
  container: htmlElement,    // Must be a valid HTMLElement
  series: [/* array of series */]
});

// 4. Update/destroy as needed
manager.update(chartId, { /* new series */ });
manager.destroy(chartId);
```

## Data Format

### Series Structure
```js
{
  label: 'Series Name',
  color: { r: 0.4, g: 0.6, b: 1.0 },  // RGB in 0-1 range, NOT 0-255
  x: [1, 2, 3, 4],                     // Must be sorted ascending
  y: [10, 20, 15, 25]                  // Same length as x
}
```

**Common Mistakes:**
- ❌ `color: { r: 100, g: 150, b: 255 }` (0-255 range)
- ✅ `color: { r: 0.4, g: 0.6, b: 1.0 }` (0-1 range)
- ❌ Unsorted x values
- ✅ X values must be sorted in ascending order

## Plugin System

Plugins extend functionality. Register before creating charts:

```js
import { registerPlugin } from 'chartai';
import { zoomPlugin } from 'chartai/plugins/zoom';
import { hoverPlugin } from 'chartai/plugins/hover';
import { labelsPlugin } from 'chartai/plugins/labels';

// Register once, applies to all charts
registerPlugin(zoomPlugin());  // Note: zoomPlugin is a factory function
registerPlugin(hoverPlugin);   // hoverPlugin is the plugin itself
registerPlugin(labelsPlugin);
```

**Available Plugins:**
- `zoomPlugin()` - Mouse wheel zoom, pan with drag
- `hoverPlugin` - Crosshair and hover detection
- `labelsPlugin` - Axis labels and grid lines

**Plugin Options:**
```js
registerPlugin(zoomPlugin({
  wheelSensitivity: 1.2,  // Default: 1.1
  maxZoom: 1000,          // Default: 100
  minZoom: 0.1            // Default: 0.1
}));
```

## Configuration Options

### Essential Options
```js
{
  type: 'line',                    // Required: 'line' | 'scatter' | 'bar'
  container: document.getElementById('chart'),  // Required: HTMLElement
  series: [/* ... */],             // Required: Array of ChartSeries
  zoomMode: 'both',                // 'both' | 'x-only' | 'y-only' | 'none'
  pointSize: 4,                    // Point radius in pixels (scatter/line)
  showTooltip: false,              // Enable built-in hover tooltip
}
```

### Performance Options
```js
{
  maxSamplesPerPixel: 1000,  // Max data points per pixel column
                              // Higher = more accurate but slower
                              // 0 = unlimited (use for < 10k points)
}
```

### Styling Options
```js
{
  bgColor: [0.1, 0.1, 0.15],      // RGB 0-1 range, default from theme
  textColor: '#e0e0e0',           // CSS color for labels
  gridColor: 'rgba(255,255,255,0.1)',  // CSS color for grid
  fontFamily: 'monospace',        // Font for axis labels
  labelSize: 12,                  // Font size for labels
}
```

### Bounds Control
```js
{
  defaultBounds: {
    minX: 0,
    maxX: 100,
    minY: -50,
    maxY: 50
  }
}
```

### Custom Formatters
```js
{
  formatX: (value) => new Date(value).toLocaleTimeString(),
  formatY: (value) => `$${value.toFixed(2)}`
}
```

## Common Patterns

### React Integration
```js
function Chart() {
  const containerRef = useRef(null);
  const chartIdRef = useRef(null);
  
  useEffect(() => {
    const manager = ChartManager.getInstance();
    
    manager.init().then(() => {
      chartIdRef.current = manager.create({
        type: 'line',
        container: containerRef.current,
        series: [/* data */]
      });
    });
    
    return () => {
      if (chartIdRef.current) {
        manager.destroy(chartIdRef.current);
      }
    };
  }, []);
  
  return <div ref={containerRef} style={{ width: '100%', height: '400px' }} />;
}
```

### Dynamic Updates
```js
// Update series data (full reupload)
manager.update(chartId, {
  series: newSeriesArray
});

// Change zoom mode
manager.setZoomMode(chartId, 'x-only');

// Get chart stats
const stats = manager.getStats();  // { fps, renderMs, total, active }
```

### Hover Interaction
```js
const chartId = manager.create({
  type: 'line',
  container: element,
  series: data,
  onHover: (hoverData) => {
    if (hoverData) {
      console.log(`Point: ${hoverData.x}, ${hoverData.y}`);
      console.log(`Series: ${hoverData.seriesLabel}`);
      console.log(`Index: ${hoverData.index}`);
    }
  }
});
```

### Multi-Chart Synchronization
Charts automatically sync when using zoom/pan plugins. To manually sync:

```js
// All charts share the same ChartManager singleton
// Zoom/pan on one chart affects all charts with matching bounds
const chart1 = manager.create({ /* config */ });
const chart2 = manager.create({ /* config */ });
// Both will synchronize automatically
```

## Gotchas and Limitations

### Data Updates
- **Full reupload on every update** - No incremental append
- For small datasets (< 100k points), this is still fast
- For streaming data, consider batching updates

### WebGPU Requirement
- **No fallback rendering** - Browser must support WebGPU
- Check compatibility: `if (!navigator.gpu) { /* show error */ }`
- Supported: Chrome 113+, Edge 113+, Safari 18+

### Performance Considerations
- Data scale limited by VRAM (M1 can handle millions before RAM exhaustion)
- Multiple charts (20+) share GPU workload efficiently
- Decimation used for large datasets (controlled by `maxSamplesPerPixel`)

### Styling Quirks
- Uses 3 layered canvases (back, main, axis)
- Color format is 0-1 range, not 0-255
- Container must have explicit dimensions (width/height in CSS)

### Bar Charts
- Bar rendering style is opinionated
- To customize, copy/modify the shader in `src/gpu-worker.ts`

### Data Format
- X values must be sorted in ascending order
- X and Y arrays must be same length
- No data validation - invalid data causes GPU errors

## Debugging

### Common Errors

**"Container not found"**
- Ensure element exists before calling `manager.create()`
- Check that container has non-zero dimensions

**"WebGPU not supported"**
- Browser doesn't support WebGPU
- Check `navigator.gpu` availability

**"Invalid color values"**
- Colors must be 0-1 range, not 0-255
- Convert: `r/255, g/255, b/255`

**Charts not visible**
- Container needs explicit CSS dimensions
- Check `z-index` if overlapping elements

**Poor performance**
- Reduce `maxSamplesPerPixel` for huge datasets
- Check GPU memory usage
- Destroy unused charts

### Performance Monitoring
```js
const stats = manager.getStats();
console.log(`FPS: ${stats.fps}`);
console.log(`Render time: ${stats.renderMs}ms`);
console.log(`Active charts: ${stats.active}/${stats.total}`);
```

## File Structure

When helping users set up ChartAI:

```
your-project/
├── node_modules/chartai/
│   ├── dist/
│   │   ├── chart-library.js      # Main library
│   │   └── chart-library.min.js  # Minified
│   └── plugins/
│       ├── zoom.js
│       ├── hover.js
│       └── labels.js
```

## Import Patterns

### ES Modules (recommended)
```js
import { ChartManager, registerPlugin } from 'chartai';
import { zoomPlugin } from 'chartai/plugins/zoom';
```

### Browser (script tag)
```html
<script type="module">
  import { ChartManager } from './node_modules/chartai/dist/chart-library.js';
</script>
```

## Best Practices for Agent Implementation

1. **Always check WebGPU support** before using ChartAI
2. **Convert colors to 0-1 range** if user provides 0-255
3. **Sort X values** if they're not already sorted
4. **Set explicit container dimensions** in CSS
5. **Call init() once** per application lifecycle
6. **Destroy charts** when components unmount (React/Vue)
7. **Register plugins before creating charts**
8. **Use TypeScript types** if available for better integration

## Example: Complete Setup

```js
import { ChartManager, registerPlugin } from 'chartai';
import { zoomPlugin } from 'chartai/plugins/zoom';
import { hoverPlugin } from 'chartai/plugins/hover';
import { labelsPlugin } from 'chartai/plugins/labels';

// Check WebGPU support
if (!navigator.gpu) {
  console.error('WebGPU not supported');
  // Show error to user
  return;
}

// Register plugins once
registerPlugin(labelsPlugin);
registerPlugin(zoomPlugin({ wheelSensitivity: 1.15 }));
registerPlugin(hoverPlugin);

// Initialize manager
const manager = ChartManager.getInstance();
await manager.init();

// Prepare data (ensure x is sorted)
const x = Array.from({ length: 1000 }, (_, i) => i);
const y = x.map(v => Math.sin(v * 0.05) * 50 + 50);

// Create chart
const chartId = manager.create({
  type: 'line',
  container: document.getElementById('chart-container'),
  series: [{
    label: 'Sine Wave',
    color: { r: 0.2, g: 0.6, b: 1.0 },  // Nice blue
    x,
    y
  }],
  zoomMode: 'both',
  showTooltip: true,
  formatX: (v) => v.toFixed(0),
  formatY: (v) => v.toFixed(2)
});

// Later: update data
manager.update(chartId, {
  series: [{ label: 'New Data', color: { r: 1, g: 0.5, b: 0 }, x: newX, y: newY }]
});

// Cleanup
manager.destroy(chartId);
```

## Philosophy

ChartAI prioritizes:
- **Performance over features** - GPU acceleration for massive datasets
- **Simplicity over flexibility** - Opinionated defaults, small API surface
- **DIY customization** - Small codebase meant to be forked/modified

The library is intentionally minimal (~11kb). For custom behaviors, users are encouraged to copy and modify the source rather than requesting features.
