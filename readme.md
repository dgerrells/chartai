# chartai

Are you looking for a simple tiny little chart library which can draw as many lines and points as you have vram? Look no further.

chartai is a library that can draw millions and millions of lines across thousands of series wickedly fast. It uses a passive rendering system that only update charts when needed. It lives in a web worker keeping the main thread free. It is fully pluggable so you only take way you need or add what's missing.

* **[Examples](https://dgerrells.github.io/chartai/)**
* **[Playground](https://dgerrells.github.io/chartai/demo/)**
* **[Silly overly complicated demo](https://dgerrells.github.io/chartai/canvas/)**

## Why chartai?

This library was inspired by uplot which is likely all you need. But if you do need the performance without the bundle bloat, this may do it.

* Tiny, unlimited line charts at ~11kb
* Customizable with plugins
* Lines, scatter, bar, adn candlestick out of the box
* Chart synchronization
* Stupid faster compute shaders
* Passively rendered, automatic virtualization
* Doesn't miss the spikes in data, unless you want it to

Cool. How do I use it?

### Add a line chart

```js
import { ChartManager } from 'chartai';
import { LineChart } from 'chartai/charts/line';

ChartManager.use(LineChart);
await ChartManager.init();

const x = Array.from({ length: 100 }, (_, i) => i);
const y = x.map(v => Math.sin(v * 0.1) * 50 + 50);

const chart = ChartManager.create({
  type: 'line',
  container: document.getElementById('chart'),
  series: [{
    label: 'My Data',
    color: 'oklab(0.65 0.15 -0.2)', 
    x,
    y
  }],
});
```

### Plugins

```js
import { ChartManager } from 'chartai';
import { labelsPlugin } from 'chartai/plugins/labels';
import { hoverPlugin } from 'chartai/plugins/hover';

ChartManager.use(zoomPlugin);
ChartManager.use(hoverPlugin);
```

### Agnostic

It is pure js. Add it to your favorite framework. 

```js
import { useEffect, useRef } from 'react';
import { ChartManager } from 'chartai';
import { LineChart } from 'chartai/charts/line';
import { zoomPlugin } from 'chartai/plugins/zoom';
import { hoverPlugin } from 'chartai/plugins/hover';
import { labelsPlugin } from 'chartai/plugins/labels';

function Chart() {
  const ref = useRef(null);
  const chartRef = useRef(null);
  
  useEffect(() => {
    ChartManager.use(LineChart);
    ChartManager.use(labelsPlugin);
    ChartManager.use(zoomPlugin());
    ChartManager.use(hoverPlugin);
    
    ChartManager.init().then(() => {
      const x = Array.from({ length: 100 }, (_, i) => i);
      const y = x.map(v => Math.sin(v * 0.1) * 50 + 50);
      
      chartRef.current = ChartManager.create({
        type: 'line',
        container: ref.current,
        series: [{ label: 'My Data', color: '#ffffff', x, y }],
        zoomMode: 'both',
        showTooltip: true
      });
      
      chartRef.current.configure({ zoomMode: 'x-only' });
    });
    
    return () => {
      chartRef.current?.destroy();
    };
  }, []);
  
  return <div ref={ref} style={{ width: '100%', height: '400px' }} />;
}
```

## Design

A little layer communicates with a web worker that does all the web gpu rendering. The design is pretty simple. Everything is a plugin. Both charts and well, plugins. The best way to see how to write your own plugins and charts is to look at the ones that exist.

Yes, you can point an agent at the examples and it will understand it. 

To demonstrate just how well it works there is a boids simulation chart where the chart data functions as starting locations for the boids. It is totally overkill and ridiculous and silly. It does show how powerful the framework is.

## Gotchas

* WebGPU - this uses it so if it isn't there it will not work. No fallback is provided as the intent is for this library to be tiny and lean. 
* Appending data - Updating data is plenty fast even with larger datasets but it could be smarter. It doesn't support having a larger buffer size and only sending updated data. It is a full update internally for now.
* Workers - The library will try and inline bundle the worker for maximum simplicity. If it fails, it will fallback to standard es worker loading.

### Contribution

I test using bun which handles most of the bundling out of the box.

You can start a server watching files by running `bun server.ts`.