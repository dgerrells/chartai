# ChartAI

Are you looking for a simple tiny little chart library which can draw as many lines and points across as many charts as you have vram? Look no further.

ChartAI is an ai powered chart library which can draw millions and millions of lines across hundreds at 60fps. But like good engineers we only draw when we need to saving battery life. 

**[Examples →](https://dgerrells.github.io/chartai/)**
**[Playground →](https://dgerrells.github.io/chartai/demo/)**
**[Real data canvas demo →](https://dgerrells.github.io/chartai/canvas/)**

Why ChartAI?

* Tiny, unlimited charts at ~11kb, plugins make it ~15kb
* Customizable with plugins
* Lines, scatter, and bars
* Chart synchronization
* Stupid faster compute shaders
* Passively rendered, automatic virtualization
* Doesn't miss the spikes in data, unless you want it to
* Simple api

### Add a line chart.

```js
import { ChartManager } from 'chartai';

const manager = ChartManager.getInstance();
await manager.init();

const x = Array.from({ length: 100 }, (_, i) => i);
const y = x.map(v => Math.sin(v * 0.1) * 50 + 50);

const chartId = manager.create({
  type: 'line',
  container: document.getElementById('chart'),
  series: [{
    label: 'My Data',
    color: { r: 0.4, g: 0.6, b: 1 },
    x,
    y
  }],
});
```

### Plugins

```js
import { ChartManager, registerPlugin } from 'chartai';
import { zoomPlugin } from 'chartai/plugins/zoom';
import { hoverPlugin } from 'chartai/plugins/hover';

registerPlugin(zoomPlugin());
registerPlugin(hoverPlugin);
```

### React weirdos

```js
import { useEffect, useRef } from 'react';
import { ChartManager, registerPlugin } from 'chartai';
import { zoomPlugin } from 'chartai/plugins/zoom';
import { hoverPlugin } from 'chartai/plugins/hover';
import { labelsPlugin } from 'chartai/plugins/labels';

function Chart() {
  const ref = useRef(null);
  const chartIdRef = useRef(null);
  
  useEffect(() => {
    registerPlugin(labelsPlugin);
    registerPlugin(zoomPlugin());
    registerPlugin(hoverPlugin);
    
    const manager = ChartManager.getInstance();
    manager.init().then(() => {
      const x = Array.from({ length: 100 }, (_, i) => i);
      const y = x.map(v => Math.sin(v * 0.1) * 50 + 50);
      
      chartIdRef.current = manager.create({
        type: 'line',
        container: ref.current,
        series: [{ label: 'My Data', color: { r: 0.4, g: 0.6, b: 1 }, x, y }],
        zoomMode: 'both',
        showTooltip: true
      });
      
      manager.setZoomMode(chartIdRef.current, 'x-only');
    });
    
    return () => {
      if (chartIdRef.current) {
        manager.destroy(chartIdRef.current);
      }
    };
  }, []);
  
  return <div ref={ref} style={{ width: '100%', height: '400px' }} />;
}
```

## Design

I need to draw lots of lines, points, boxes whatever on multiple (2o+) charts where the view port is synchronized. The solution is to have a web worker generating frames via compute shaders. This allows for almost unlimited charts. As many as you can fit on the screen. Data scale depends on hardware but an m1 can push it at 60fps until ram runs out.

## Gotchas and missing features

* appending or updating is stupid. Full reupload. There are ways you can fast copy on the gpu memory to smartly grow. At small sizes it is still butter.
* Bar charts...i like these and will not change them. They may not fit your jib. Copypasta your own shader, this lib is tiny. 
* Webgpu is used. No compute shaders, no charts
* missing line size option. I need to switch up to a post process option (works well and cheap) or use signed distance fields. Many benefits but complex.
* triple layered canvas. The plugins allow for canvas drawing behind and in front of the chart via 2 extra canvases. I hate it. There is a way I think to use a single canvas but I am still trying to figure it out.
* Decimation may not be to your liking.
* Finding the closes data point is a little messy.
* I fucking hate npm publishing so if you like this, best bet is to just copypasta whatever you want. Or point local AI at this repo cook.
* AI help with human review. If you want your code free-range and hormone free, look elsewhere. This works for me. 
