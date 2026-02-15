# Integration Demo

Comprehensive demo testing all ChartAI features using Vite.

## Setup

```bash
cd demos/integration
npm install
npm run dev
```

Open **http://localhost:8092**

## Features Tested

### Chart Types
- Scatter chart (2000 points)
- Line chart (multi-series, 1000 points)
- Bar chart (60 bars)
- Large dataset (10k points per series)
- Raw chart without plugins

### Plugins
- Labels plugin
- Zoom plugin (x-only, y-only, xy modes)
- Hover plugin with tooltips

### Interactions
- Theme switching (dark/light)
- Synchronized view panning/zooming across charts
- Dynamic data updates
- Zoom reset
- Performance stats monitoring

### API Coverage
- `ChartManager.getInstance()`
- `init()` - WebGPU initialization
- `create()` - All chart types
- `updateSeries()` - Dynamic updates
- `setTheme()` - Theme switching
- `setSyncViews()` - View synchronization
- `resetView()` - Reset zoom/pan
- `onStats()` - Performance monitoring
- `getChartCount()` - Chart management
