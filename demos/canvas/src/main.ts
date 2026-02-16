// Chartai Canvas Demo — Infinite canvas with draggable, resizable chart tiles

import { ChartManager, registerPlugin } from "/src/chart-library.ts";
import type {
  ChartType,
  ChartConfig,
  ChartSeries,
} from "/src/chart-library.ts";
import { labelsPlugin } from "/src/plugins/labels.ts";
import { zoomPlugin } from "/src/plugins/zoom.ts";
import { hoverPlugin } from "/src/plugins/hover.ts";

registerPlugin(labelsPlugin);
registerPlugin(zoomPlugin());
registerPlugin(hoverPlugin);

// ─── Types ──────────────────────────────────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasChart {
  id: string;
  chartId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: ChartType;
  el: HTMLElement;
}

interface DataPreset {
  name: string;
  category: string;
  url: string;
  transform: string;
  type: ChartType;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID = 16;
const MIN_W = 320;
const MIN_H = 240;
const DEFAULT_W = 480;
const DEFAULT_H = 320;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const ZOOM_SPEED = 0.0015;

// ─── Data Presets ───────────────────────────────────────────────────────────

const PRESETS: DataPreset[] = [
  // ── GDP & Growth (World Bank) ──
  {
    name: "US GDP (1960–2024)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/us/indicator/NY.GDP.MKTP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "China GDP (1960–2024)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/cn/indicator/NY.GDP.MKTP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "India GDP (1960–2024)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/in/indicator/NY.GDP.MKTP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Japan GDP (1960–2024)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/jp/indicator/NY.GDP.MKTP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Germany GDP (1960–2024)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/de/indicator/NY.GDP.MKTP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Brazil GDP (1960–2024)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/br/indicator/NY.GDP.MKTP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Nigeria GDP (1960–2024)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/ng/indicator/NY.GDP.MKTP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "US GDP per Capita",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/us/indicator/NY.GDP.PCAP.CD?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "China GDP Growth % (annual)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/cn/indicator/NY.GDP.MKTP.KD.ZG?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "bar",
  },
  {
    name: "India GDP Growth % (annual)",
    category: "GDP & Growth",
    url: "https://api.worldbank.org/v2/country/in/indicator/NY.GDP.MKTP.KD.ZG?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "bar",
  },
  // ── Crypto (CoinGecko) ──
  {
    name: "Bitcoin 1yr",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "Ethereum 1yr",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=365",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "Solana 90d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=90",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "Dogecoin 90d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/dogecoin/market_chart?vs_currency=usd&days=90",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "Cardano 90d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/cardano/market_chart?vs_currency=usd&days=90",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "XRP 90d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=usd&days=90",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "Polkadot 90d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/polkadot/market_chart?vs_currency=usd&days=90",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "Chainlink 90d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/chainlink/market_chart?vs_currency=usd&days=90",
    transform: `const p = data.prices;
return { x: p.map((_, i) => i), y: p.map(d => d[1]) };`,
    type: "line",
  },
  {
    name: "BTC Volume 30d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=30",
    transform: `const v = data.total_volumes;
return { x: v.map((_, i) => i), y: v.map(d => d[1]) };`,
    type: "bar",
  },
  {
    name: "ETH Volume 30d",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=30",
    transform: `const v = data.total_volumes;
return { x: v.map((_, i) => i), y: v.map(d => d[1]) };`,
    type: "bar",
  },
  {
    name: "BTC Market Cap 1yr",
    category: "Crypto",
    url: "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365",
    transform: `const m = data.market_caps;
return { x: m.map((_, i) => i), y: m.map(d => d[1]) };`,
    type: "line",
  },
  // ── Population & Society (World Bank) ──
  {
    name: "World Population",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/wld/indicator/SP.POP.TOTL?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "India Population",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/in/indicator/SP.POP.TOTL?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Japan Population (decline)",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/jp/indicator/SP.POP.TOTL?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Nigeria Population (boom)",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/ng/indicator/SP.POP.TOTL?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "US Life Expectancy",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/us/indicator/SP.DYN.LE00.IN?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Japan Life Expectancy",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/jp/indicator/SP.DYN.LE00.IN?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Global Fertility Rate",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/wld/indicator/SP.DYN.TFRT.IN?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Global Infant Mortality",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/wld/indicator/SP.DYN.IMRT.IN?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "US Unemployment %",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/us/indicator/SL.UEM.TOTL.NE.ZS?date=1991:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "South Africa Unemployment %",
    category: "Population & Society",
    url: "https://api.worldbank.org/v2/country/za/indicator/SL.UEM.TOTL.NE.ZS?date=1991:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  // ── Energy & Emissions (World Bank) ──
  {
    name: "Global CO2 (kt)",
    category: "Energy & Emissions",
    url: "https://api.worldbank.org/v2/country/wld/indicator/EN.ATM.CO2E.KT?date=1960:2022&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "US CO2 per Capita",
    category: "Energy & Emissions",
    url: "https://api.worldbank.org/v2/country/us/indicator/EN.ATM.CO2E.PC?date=1960:2022&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "China CO2 per Capita",
    category: "Energy & Emissions",
    url: "https://api.worldbank.org/v2/country/cn/indicator/EN.ATM.CO2E.PC?date=1960:2022&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Global Renewable Energy %",
    category: "Energy & Emissions",
    url: "https://api.worldbank.org/v2/country/wld/indicator/EG.FEC.RNEW.ZS?date=1990:2022&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Global Electricity Access %",
    category: "Energy & Emissions",
    url: "https://api.worldbank.org/v2/country/wld/indicator/EG.ELC.ACCS.ZS?date=1990:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "India Electricity Access %",
    category: "Energy & Emissions",
    url: "https://api.worldbank.org/v2/country/in/indicator/EG.ELC.ACCS.ZS?date=1990:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Brazil Forest Area %",
    category: "Energy & Emissions",
    url: "https://api.worldbank.org/v2/country/br/indicator/AG.LND.FRST.ZS?date=1990:2022&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  // ── Technology & Trade (World Bank) ──
  {
    name: "Global Internet Users %",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/wld/indicator/IT.NET.USER.ZS?date=1990:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "China Mobile Subscriptions / 100",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/cn/indicator/IT.CEL.SETS.P2?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "India Internet Users %",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/in/indicator/IT.NET.USER.ZS?date=1990:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "US R&D Spending % GDP",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/us/indicator/GB.XPD.RSDV.GD.ZS?date=1996:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "South Korea R&D % GDP",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/kr/indicator/GB.XPD.RSDV.GD.ZS?date=1996:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "US Military Spending % GDP",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/us/indicator/MS.MIL.XPND.GD.ZS?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Global Trade % of GDP",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/wld/indicator/NE.TRD.GNFS.ZS?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "US Inflation (CPI %)",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/us/indicator/FP.CPI.TOTL.ZG?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "line",
  },
  {
    name: "Argentina Inflation (CPI %)",
    category: "Technology & Trade",
    url: "https://api.worldbank.org/v2/country/ar/indicator/FP.CPI.TOTL.ZG?date=1960:2024&format=json&per_page=100",
    transform: `const items = data[1].filter(d => d.value != null).reverse();
return { x: items.map(d => parseInt(d.date)), y: items.map(d => d.value) };`,
    type: "bar",
  },
  // ── Climate & Weather (NASA POWER — daily, 10k+ pts) ──
  {
    name: "SF Bay Temp (10yr daily)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=SB&longitude=-122.4&latitude=37.8&start=20150101&end=20241231&format=JSON",
    transform: `const temps = data.properties.parameter.T2M;
const entries = Object.entries(temps).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "Tokyo Temp (10yr daily)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=SB&longitude=139.7&latitude=35.7&start=20150101&end=20241231&format=JSON",
    transform: `const temps = data.properties.parameter.T2M;
const entries = Object.entries(temps).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "Death Valley Temp (10yr)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=SB&longitude=-116.8&latitude=36.5&start=20150101&end=20241231&format=JSON",
    transform: `const temps = data.properties.parameter.T2M;
const entries = Object.entries(temps).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "Antarctica Temp (10yr)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=SB&longitude=0&latitude=-85&start=20150101&end=20241231&format=JSON",
    transform: `const temps = data.properties.parameter.T2M;
const entries = Object.entries(temps).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "Sahara Solar Radiation (10yr)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=SB&longitude=3&latitude=23.5&start=20150101&end=20241231&format=JSON",
    transform: `const param = data.properties.parameter.ALLSKY_SFC_SW_DWN;
const entries = Object.entries(param).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "London Solar Radiation (10yr)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=SB&longitude=-0.12&latitude=51.5&start=20150101&end=20241231&format=JSON",
    transform: `const param = data.properties.parameter.ALLSKY_SFC_SW_DWN;
const entries = Object.entries(param).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "Reykjavik Wind Speed (10yr)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=WS10M&community=SB&longitude=-21.9&latitude=64.1&start=20150101&end=20241231&format=JSON",
    transform: `const param = data.properties.parameter.WS10M;
const entries = Object.entries(param).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "Mumbai Humidity (10yr)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=RH2M&community=SB&longitude=72.9&latitude=19.1&start=20150101&end=20241231&format=JSON",
    transform: `const param = data.properties.parameter.RH2M;
const entries = Object.entries(param).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "line",
  },
  {
    name: "Denver Precipitation (10yr)",
    category: "Climate & Weather",
    url: "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=SB&longitude=-104.9&latitude=39.7&start=20150101&end=20241231&format=JSON",
    transform: `const param = data.properties.parameter.PRECTOTCORR;
const entries = Object.entries(param).filter(([k, v]) => v !== -999);
return { x: entries.map((_, i) => i), y: entries.map(([k, v]) => v) };`,
    type: "bar",
  },
  // ── Seismology (USGS — thousands of events) ──
  {
    name: "Earthquakes (30d scatter)",
    category: "Seismology",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
    transform: `const f = data.features.filter(f => f.properties.mag != null);
f.sort((a, b) => a.properties.time - b.properties.time);
const t0 = f[0]?.properties.time || 0;
return {
  x: f.map(f => (f.properties.time - t0) / 3600000),
  y: f.map(f => f.properties.mag)
};`,
    type: "scatter",
  },
  {
    name: "Earthquake Depth vs Mag",
    category: "Seismology",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
    transform: `const f = data.features.filter(f => f.properties.mag != null && f.geometry.coordinates[2] > 0);
return {
  x: f.map(f => f.geometry.coordinates[2]),
  y: f.map(f => f.properties.mag)
};`,
    type: "scatter",
  },
  {
    name: "Quake Lat vs Lng (plate map)",
    category: "Seismology",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
    transform: `const f = data.features.filter(f => f.properties.mag != null);
return {
  x: f.map(f => f.geometry.coordinates[0]),
  y: f.map(f => f.geometry.coordinates[1])
};`,
    type: "scatter",
  },
  {
    name: "Significant Quakes (30d)",
    category: "Seismology",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson",
    transform: `const f = data.features.filter(f => f.properties.mag != null);
f.sort((a, b) => a.properties.time - b.properties.time);
return {
  x: f.map((_, i) => i),
  y: f.map(f => f.properties.mag)
};`,
    type: "bar",
  },
  {
    name: "M4.5+ Quakes (30d)",
    category: "Seismology",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
    transform: `const f = data.features.filter(f => f.properties.mag != null);
f.sort((a, b) => a.properties.time - b.properties.time);
const t0 = f[0]?.properties.time || 0;
return {
  x: f.map(f => (f.properties.time - t0) / 3600000),
  y: f.map(f => f.properties.mag)
};`,
    type: "scatter",
  },
  // ── Synthetic ──
  {
    name: "Random Walk (100k)",
    category: "Synthetic",
    url: "",
    transform: `const n = 100000;
const x = new Array(n), y = new Array(n);
let v = 0;
for (let i = 0; i < n; i++) { x[i] = i; v += (Math.random() - 0.498) * 2; y[i] = v; }
return { x, y };`,
    type: "line",
  },
  {
    name: "Random Walk (1M)",
    category: "Synthetic",
    url: "",
    transform: `const n = 1000000;
const x = new Array(n), y = new Array(n);
let v = 0;
for (let i = 0; i < n; i++) { x[i] = i; v += (Math.random() - 0.498) * 2; y[i] = v; }
return { x, y };`,
    type: "line",
  },
  {
    name: "Sine Waves (10k)",
    category: "Synthetic",
    url: "",
    transform: `const n = 10000;
const x = new Array(n), y = new Array(n);
for (let i = 0; i < n; i++) { x[i] = i; y[i] = Math.sin(i * 0.01) + Math.sin(i * 0.03) * 0.5; }
return { x, y };`,
    type: "line",
  },
  {
    name: "Noise Cloud (50k)",
    category: "Synthetic",
    url: "",
    transform: `const n = 50000;
const x = new Array(n), y = new Array(n);
for (let i = 0; i < n; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(-2 * Math.log(Math.random()));
  x[i] = Math.cos(a) * r; y[i] = Math.sin(a) * r;
}
return { x, y };`,
    type: "scatter",
  },
  {
    name: "Deadmau5 (10M)",
    category: "Synthetic",
    url: "",
    transform: `const N = 10000000, x = new Array(N), y = new Array(N);
const rp = (cx, cy, r) => {
  const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * r;
  return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
};
let i = 0;
while (i < N) {
  let p, s = Math.random();
  if (s < 0.5) {
    p = rp(0, 0, 5);
    const lx = p[0] + 1.7, ly = p[1] - 0.8, rx = p[0] - 1.7, ry = p[1] - 0.8;
    if (lx * lx + ly * ly < 1.44 || rx * rx + ry * ry < 1.44) continue;
    const sd = p[0] * p[0] + (p[1] + 1) * (p[1] + 1);
    if (p[1] < -1 && sd > 5.76 && sd < 9 && Math.abs(p[0]) < 2.8) continue;
  } else if (s < 0.75) { p = rp(-3.8, 5.8, 3); }
  else { p = rp(3.8, 5.8, 3); }
  x[i] = p[0]; y[i] = p[1]; i++;
}
return { x, y };`,
    type: "scatter",
  },
  {
    name: "Spiral Galaxy (5M)",
    category: "Synthetic",
    url: "",
    transform: `const N = 5000000, x = new Array(N), y = new Array(N);
for (let i = 0; i < N; i++) {
  const arm = (Math.random() * 4) | 0;
  const d = Math.sqrt(Math.random()) * 12;
  const a = d * 0.7 + arm * 1.5708 + (Math.random() - 0.5) * (0.4 + d * 0.04);
  x[i] = Math.cos(a) * d;
  y[i] = Math.sin(a) * d;
}
return { x, y };`,
    type: "scatter",
  },
  {
    name: "Heart (2M)",
    category: "Synthetic",
    url: "",
    transform: `const N = 2000000, x = new Array(N), y = new Array(N);
let i = 0;
while (i < N) {
  const px = (Math.random() - 0.5) * 36, py = (Math.random() - 0.5) * 34;
  const nx = px / 16, ny = (py - 3) / 16;
  const v = nx * nx + ny * ny - 1;
  if (v * v * v - nx * nx * ny * ny * ny <= 0) { x[i] = px; y[i] = py; i++; }
}
return { x, y };`,
    type: "scatter",
  },
  {
    name: "Lissajous (500k)",
    category: "Synthetic",
    url: "",
    transform: `const N = 500000, x = new Array(N), y = new Array(N);
for (let i = 0; i < N; i++) {
  const t = i * 0.0001 + Math.random() * 0.02;
  x[i] = Math.sin(3 * t + 0.5) + (Math.random() - 0.5) * 0.05;
  y[i] = Math.sin(5 * t) + (Math.random() - 0.5) * 0.05;
}
return { x, y };`,
    type: "scatter",
  },
];

// ─── State ──────────────────────────────────────────────────────────────────

let manager: ChartManager;
const charts: CanvasChart[] = [];
let nextId = 1;

// Viewport pan/zoom
let panX = 0;
let panY = 0;
let zoom = 1;

// DOM refs
let viewport: HTMLElement;
let canvas: HTMLElement;
let contextMenu: HTMLElement;

// Drag/resize state
let activeOp: null | {
  type: "pan" | "drag" | "resize";
  chart?: CanvasChart;
  handle?: string;
  startMX: number;
  startMY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startPanX: number;
  startPanY: number;
} = null;

// Data modal state
let modalTargetChart: CanvasChart | null = null;
let selectedPresetName: string | null = null;

// Context menu canvas position
let ctxMenuCanvasX = 0;
let ctxMenuCanvasY = 0;

// ─── Utility ────────────────────────────────────────────────────────────────

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function hasOverlap(rect: Rect, excludeId?: string): boolean {
  for (const c of charts) {
    if (c.id === excludeId) continue;
    if (rectsOverlap(rect, c)) return true;
  }
  return false;
}

function screenToCanvas(sx: number, sy: number): { x: number; y: number } {
  const vr = viewport.getBoundingClientRect();
  return {
    x: (sx - vr.left - panX) / zoom,
    y: (sy - vr.top - panY) / zoom,
  };
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return { r: r + m, g: g + m, b: b + m };
}

function randomColor(): { r: number; g: number; b: number } {
  return hslToRgb(
    Math.random() * 360,
    0.6 + Math.random() * 0.2,
    0.5 + Math.random() * 0.15,
  );
}

function generateDefaultData(): { x: number[]; y: number[] } {
  const n = 1000;
  const x = new Array(n);
  const y = new Array(n);
  let v = 50;
  for (let i = 0; i < n; i++) {
    x[i] = i;
    v += (Math.random() - 0.498) * 3;
    y[i] = v;
  }
  return { x, y };
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + "M";
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatIndex(value: number): string {
  return Math.round(value).toString();
}

function formatCount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return n.toString();
}

// Hidden canvas context for measuring text width
const _measureCtx = document.createElement("canvas").getContext("2d")!;
function measureTextWidth(text: string, font: string): number {
  _measureCtx.font = font;
  return _measureCtx.measureText(text || " ").width;
}

// ─── Viewport Pan & Zoom ───────────────────────────────────────────────────

function updateTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  // Sync dot pattern with pan/zoom
  const dotGap = 24 * zoom;
  viewport.style.backgroundSize = `${dotGap}px ${dotGap}px`;
  viewport.style.backgroundPosition = `${panX % dotGap}px ${panY % dotGap}px`;
}

let zoomIndicatorTimer = 0;
function showZoomIndicator() {
  const el = document.getElementById("zoom-indicator")!;
  el.textContent = Math.round(zoom * 100) + "%";
  el.classList.add("visible");
  clearTimeout(zoomIndicatorTimer);
  zoomIndicatorTimer = window.setTimeout(
    () => el.classList.remove("visible"),
    800,
  );
}

function setupViewport() {
  viewport = document.getElementById("viewport")!;
  canvas = document.getElementById("canvas")!;
  contextMenu = document.getElementById("context-menu")!;

  // ── Mouse wheel → zoom (only on empty canvas, tiles stop propagation) ──
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = -e.deltaY * ZOOM_SPEED;
      const newZoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, zoom * (1 + delta)),
      );
      const vr = viewport.getBoundingClientRect();
      const mx = e.clientX - vr.left;
      const my = e.clientY - vr.top;
      // Keep point under cursor stationary
      panX = mx - ((mx - panX) / zoom) * newZoom;
      panY = my - ((my - panY) / zoom) * newZoom;
      zoom = newZoom;
      updateTransform();
      showZoomIndicator();
    },
    { passive: false },
  );

  // ── Mouse down → start pan or delegate ──
  viewport.addEventListener("mousedown", (e) => {
    // Close menus on any click
    closeContextMenu();
    closeDropdown();

    // Only pan on left-click directly on viewport/canvas (not on tiles)
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target !== viewport &&
      target !== canvas &&
      !target.classList.contains("vignette")
    )
      return;

    e.preventDefault();
    activeOp = {
      type: "pan",
      startMX: e.clientX,
      startMY: e.clientY,
      startX: 0,
      startY: 0,
      startW: 0,
      startH: 0,
      startPanX: panX,
      startPanY: panY,
    };
    viewport.classList.add("grabbing");
  });

  // ── Global mouse move/up ──
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  // ── Context menu ──
  viewport.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    // Only show on empty canvas area
    if (
      target !== viewport &&
      target !== canvas &&
      !target.classList.contains("vignette")
    )
      return;

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    ctxMenuCanvasX = snap(canvasPos.x);
    ctxMenuCanvasY = snap(canvasPos.y);

    contextMenu.style.left = e.clientX + "px";
    contextMenu.style.top = e.clientY + "px";
    contextMenu.classList.add("open");
  });

  // Context menu buttons
  contextMenu.querySelectorAll("button[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = (btn as HTMLElement).dataset.type as ChartType;
      addChartAt(type, ctxMenuCanvasX, ctxMenuCanvasY);
      closeContextMenu();
    });
  });

  // Close context menu on any click elsewhere
  document.addEventListener("mousedown", (e) => {
    if (!(e.target as HTMLElement).closest(".context-menu")) {
      closeContextMenu();
    }
  });

  updateTransform();
}

function closeContextMenu() {
  contextMenu.classList.remove("open");
}

function closeDropdown() {
  document.getElementById("add-menu")!.classList.remove("open");
}

// ─── Mouse Move / Up Handlers ───────────────────────────────────────────────

function onMouseMove(e: MouseEvent) {
  if (!activeOp) return;
  e.preventDefault();

  const dx = e.clientX - activeOp.startMX;
  const dy = e.clientY - activeOp.startMY;

  if (activeOp.type === "pan") {
    panX = activeOp.startPanX + dx;
    panY = activeOp.startPanY + dy;
    updateTransform();
    return;
  }

  if (activeOp.type === "drag" && activeOp.chart) {
    const chart = activeOp.chart;
    const newX = snap(activeOp.startX + dx / zoom);
    const newY = snap(activeOp.startY + dy / zoom);

    // Axis-independent sliding: try both, then each axis alone
    const both: Rect = { x: newX, y: newY, w: chart.w, h: chart.h };
    if (!hasOverlap(both, chart.id)) {
      chart.x = newX;
      chart.y = newY;
    } else {
      const xOk = !hasOverlap(
        { x: newX, y: chart.y, w: chart.w, h: chart.h },
        chart.id,
      );
      const yOk = !hasOverlap(
        { x: chart.x, y: newY, w: chart.w, h: chart.h },
        chart.id,
      );
      if (xOk) chart.x = newX;
      if (yOk) chart.y = newY;
    }
    updateTilePosition(chart);
    return;
  }

  if (activeOp.type === "resize" && activeOp.chart) {
    const chart = activeOp.chart;
    const handle = activeOp.handle!;
    let newX = chart.x,
      newY = chart.y,
      newW = chart.w,
      newH = chart.h;

    const cdx = dx / zoom;
    const cdy = dy / zoom;

    // Adjust based on handle direction
    if (handle.includes("e")) {
      newW = snap(Math.max(MIN_W, activeOp.startW + cdx));
    }
    if (handle.includes("w")) {
      const proposedW = snap(Math.max(MIN_W, activeOp.startW - cdx));
      newX = snap(activeOp.startX + (activeOp.startW - proposedW));
      newW = proposedW;
    }
    if (handle.includes("s")) {
      newH = snap(Math.max(MIN_H, activeOp.startH + cdy));
    }
    if (handle.includes("n")) {
      const proposedH = snap(Math.max(MIN_H, activeOp.startH - cdy));
      newY = snap(activeOp.startY + (activeOp.startH - proposedH));
      newH = proposedH;
    }

    // Axis-independent: try both, then each axis alone
    const both: Rect = { x: newX, y: newY, w: newW, h: newH };
    if (!hasOverlap(both, chart.id)) {
      chart.x = newX;
      chart.y = newY;
      chart.w = newW;
      chart.h = newH;
    } else {
      // X-axis only (horizontal resize change, keep original vertical)
      const xOnly: Rect = { x: newX, y: chart.y, w: newW, h: chart.h };
      // Y-axis only (vertical resize change, keep original horizontal)
      const yOnly: Rect = { x: chart.x, y: newY, w: chart.w, h: newH };
      if (!hasOverlap(xOnly, chart.id)) {
        chart.x = newX;
        chart.w = newW;
      }
      if (!hasOverlap(yOnly, chart.id)) {
        chart.y = newY;
        chart.h = newH;
      }
    }
    updateTilePosition(chart);
    updateTileSize(chart);
    return;
  }
}

function onMouseUp(_e: MouseEvent) {
  if (!activeOp) return;
  if (activeOp.type === "pan") {
    viewport.classList.remove("grabbing");
  }
  if (activeOp.type === "drag" && activeOp.chart) {
    activeOp.chart.el.classList.remove("dragging");
  }
  if (activeOp.type === "resize" && activeOp.chart) {
    activeOp.chart.el.classList.remove("resizing");
  }
  activeOp = null;
}

// ─── Find Empty Spot ────────────────────────────────────────────────────────

function findEmptySpot(w: number, h: number): { x: number; y: number } {
  const vr = viewport.getBoundingClientRect();
  const cx = snap((-panX + vr.width / 2) / zoom - w / 2);
  const cy = snap((-panY + vr.height / 2) / zoom - h / 2);

  // Try center first
  if (!hasOverlap({ x: cx, y: cy, w, h })) return { x: cx, y: cy };

  // Spiral outward
  for (let d = GRID; d < 4000; d += GRID) {
    for (let offset = -d; offset <= d; offset += GRID) {
      if (!hasOverlap({ x: cx + offset, y: cy - d, w, h }))
        return { x: cx + offset, y: cy - d };
      if (!hasOverlap({ x: cx + offset, y: cy + d, w, h }))
        return { x: cx + offset, y: cy + d };
      if (!hasOverlap({ x: cx - d, y: cy + offset, w, h }))
        return { x: cx - d, y: cy + offset };
      if (!hasOverlap({ x: cx + d, y: cy + offset, w, h }))
        return { x: cx + d, y: cy + offset };
    }
  }

  return { x: cx, y: cy };
}

// ─── Chart Tile Management ──────────────────────────────────────────────────

function addChartAt(type: ChartType, cx: number, cy: number) {
  const id = "tile-" + nextId++;
  const w = snap(DEFAULT_W);
  const h = snap(DEFAULT_H);
  let x = snap(cx - w / 2);
  let y = snap(cy - h / 2);

  // If overlapping, nudge to find space
  if (hasOverlap({ x, y, w, h })) {
    const spot = findEmptySpot(w, h);
    x = spot.x;
    y = spot.y;
  }

  const chart: CanvasChart = {
    id,
    chartId: "",
    name: "Chart " + (nextId - 1),
    x,
    y,
    w,
    h,
    type,
    el: null as any,
  };

  const el = createTileElement(chart);
  chart.el = el;
  canvas.appendChild(el);
  charts.push(chart);

  // Create the WebGPU chart inside the tile body
  const body = el.querySelector(".tile-body") as HTMLElement;

  // Get series count from input
  const seriesCountInput = document.getElementById(
    "series-count",
  ) as HTMLInputElement;
  const seriesCount = Math.max(
    1,
    Math.min(100, parseInt(seriesCountInput?.value || "3")),
  );

  // Generate multiple series
  const series: ChartSeries[] = [];
  for (let i = 0; i < seriesCount; i++) {
    const data = generateDefaultData();
    const color = randomColor();
    series.push({
      label: `Series ${String.fromCharCode(65 + i)}`,
      color,
      x: data.x,
      y: data.y,
    });
  }

  const config: ChartConfig = {
    type,
    container: body,
    series,
    formatX: formatIndex,
    formatY: formatNumber,
    zoomMode: "both",
    showTooltip: true,
    bgColor: [0.055, 0.055, 0.086],
    textColor: "#8888a0",
    gridColor: "#262638",
  };

  try {
    chart.chartId = manager.create(config);
  } catch (err) {
    console.error("Failed to create chart:", err);
    el.remove();
    charts.splice(charts.indexOf(chart), 1);
    return;
  }
}

function addChartAuto(type: ChartType) {
  const w = snap(DEFAULT_W);
  const h = snap(DEFAULT_H);
  const spot = findEmptySpot(w, h);
  addChartAt(type, spot.x + w / 2, spot.y + h / 2);
}

function removeChart(id: string) {
  const idx = charts.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const chart = charts[idx];
  if (chart.chartId) manager.destroy(chart.chartId);
  chart.el.remove();
  charts.splice(idx, 1);
}

function clearAllCharts() {
  for (const chart of [...charts]) {
    removeChart(chart.id);
  }
}

// ─── Tile DOM ───────────────────────────────────────────────────────────────

function autoSizeNameInput(input: HTMLInputElement) {
  const font =
    "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const update = () => {
    const w = measureTextWidth(input.value, font);
    input.style.width = Math.max(20, Math.ceil(w) + 14) + "px";
  };
  input.addEventListener("input", update);
  // Also run on focus-out to settle
  input.addEventListener("blur", update);
  update();
  return update;
}

function createTileElement(chart: CanvasChart): HTMLElement {
  const el = document.createElement("div");
  el.className = "chart-tile";
  el.dataset.tileId = chart.id;
  el.style.left = chart.x + "px";
  el.style.top = chart.y + "px";
  el.style.width = chart.w + "px";
  el.style.height = chart.h + "px";

  const typeLabel = chart.type.charAt(0).toUpperCase() + chart.type.slice(1);

  const pointSizeHtml =
    chart.type === "scatter"
      ? `<div class="tile-point-size">
        <input type="range" min="1" max="12" value="3" class="point-size-slider" title="Point size">
        <span class="point-size-label">3px</span>
      </div>`
      : "";

  el.innerHTML = `
    <div class="tile-header">
      <input class="tile-name" value="${chart.name}" spellcheck="false" />
      <div class="tile-tools">
        <span class="tile-type">${typeLabel}</span>
        <span class="tile-points">1k</span>
        ${pointSizeHtml}
        <button class="tile-btn" data-action="reset" title="Reset view">&#x2318;</button>
        <button class="tile-btn" data-action="data" title="Load data source">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3v8M5 8l3 3 3-3"/>
            <path d="M3 12h10"/>
          </svg>
        </button>
        <button class="tile-btn danger" data-action="close" title="Remove chart">&times;</button>
      </div>
    </div>
    <div class="tile-body"></div>
    <div class="resize-handle resize-n" data-handle="n"></div>
    <div class="resize-handle resize-s" data-handle="s"></div>
    <div class="resize-handle resize-e" data-handle="e"></div>
    <div class="resize-handle resize-w" data-handle="w"></div>
    <div class="resize-handle resize-ne" data-handle="ne"></div>
    <div class="resize-handle resize-nw" data-handle="nw"></div>
    <div class="resize-handle resize-se" data-handle="se"></div>
    <div class="resize-handle resize-sw" data-handle="sw"></div>
  `;

  // ── Stop wheel events from reaching the viewport (chart has its own zoom) ──
  el.addEventListener("wheel", (e) => e.stopPropagation());

  // ── Name editing with auto-size ──
  const nameInput = el.querySelector(".tile-name") as HTMLInputElement;
  const resizeName = autoSizeNameInput(nameInput);
  nameInput.addEventListener("input", () => {
    chart.name = nameInput.value;
  });
  // Prevent canvas pan when interacting with input
  nameInput.addEventListener("mousedown", (e) => e.stopPropagation());
  // Store the resize function so we can call it when loading data sets the name
  (el as any)._resizeName = resizeName;

  // ── Point size slider (scatter only) ──
  const pointSlider = el.querySelector(
    ".point-size-slider",
  ) as HTMLInputElement | null;
  const pointLabel = el.querySelector(
    ".point-size-label",
  ) as HTMLElement | null;
  if (pointSlider && pointLabel) {
    pointSlider.addEventListener("input", () => {
      const size = parseInt(pointSlider.value);
      pointLabel.textContent = size + "px";
      if (chart.chartId) manager.setPointSize(chart.chartId, size);
    });
    pointSlider.addEventListener("mousedown", (e) => e.stopPropagation());
  }

  // ── Header drag ──
  const header = el.querySelector(".tile-header") as HTMLElement;
  header.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "BUTTON" ||
      target.closest("button")
    )
      return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    el.classList.add("dragging");
    activeOp = {
      type: "drag",
      chart,
      startMX: e.clientX,
      startMY: e.clientY,
      startX: chart.x,
      startY: chart.y,
      startW: chart.w,
      startH: chart.h,
      startPanX: panX,
      startPanY: panY,
    };
  });

  // ── Resize handles ──
  el.querySelectorAll(".resize-handle").forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = (handle as HTMLElement).dataset.handle!;

      el.classList.add("resizing");
      activeOp = {
        type: "resize",
        chart,
        handle: dir,
        startMX: (e as MouseEvent).clientX,
        startMY: (e as MouseEvent).clientY,
        startX: chart.x,
        startY: chart.y,
        startW: chart.w,
        startH: chart.h,
        startPanX: panX,
        startPanY: panY,
      };
    });
  });

  // ── Button actions ──
  el.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(
      "[data-action]",
    ) as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "close") removeChart(chart.id);
    if (action === "data") showDataDialog(chart);
    if (action === "reset" && chart.chartId) manager.resetView(chart.chartId);
  });

  return el;
}

function updateTilePoints(chart: CanvasChart, count: number) {
  const badge = chart.el.querySelector(".tile-points");
  if (badge) badge.textContent = formatCount(count);
}

function updateTilePosition(chart: CanvasChart) {
  chart.el.style.left = chart.x + "px";
  chart.el.style.top = chart.y + "px";
}

function updateTileSize(chart: CanvasChart) {
  chart.el.style.width = chart.w + "px";
  chart.el.style.height = chart.h + "px";
}

// ─── Data Source Dialog ─────────────────────────────────────────────────────

function showDataDialog(chart: CanvasChart) {
  modalTargetChart = chart;
  selectedPresetName = null;
  const modal = document.getElementById("data-modal")!;
  const urlInput = document.getElementById("data-url") as HTMLInputElement;
  const transformInput = document.getElementById(
    "data-transform",
  ) as HTMLTextAreaElement;
  const errorEl = document.getElementById("data-error")!;

  urlInput.value = "";
  transformInput.value = "";
  errorEl.classList.add("hidden");
  errorEl.textContent = "";

  // Build preset buttons grouped by category
  const presetsContainer = document.getElementById("presets")!;
  presetsContainer.innerHTML = "";

  // Group presets by category preserving order
  const categoryOrder: string[] = [];
  const categoryMap = new Map<string, DataPreset[]>();
  for (const preset of PRESETS) {
    if (!categoryMap.has(preset.category)) {
      categoryOrder.push(preset.category);
      categoryMap.set(preset.category, []);
    }
    categoryMap.get(preset.category)!.push(preset);
  }

  for (const cat of categoryOrder) {
    const section = document.createElement("div");
    section.className = "preset-category";

    const header = document.createElement("div");
    header.className = "preset-category-header";
    header.textContent = cat;
    section.appendChild(header);

    const items = document.createElement("div");
    items.className = "preset-category-items";

    for (const preset of categoryMap.get(cat)!) {
      const btn = document.createElement("button");
      btn.className = "preset-btn";
      btn.textContent = preset.name;
      btn.addEventListener("click", () => {
        urlInput.value = preset.url;
        transformInput.value = preset.transform;
        selectedPresetName = preset.name;
        errorEl.classList.add("hidden");
        // Highlight active preset
        presetsContainer
          .querySelectorAll(".preset-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      items.appendChild(btn);
    }

    section.appendChild(items);
    presetsContainer.appendChild(section);
  }

  modal.classList.add("open");
}

async function loadPresetIntoChart(chart: CanvasChart, preset: DataPreset) {
  try {
    let data: any = null;
    if (preset.url) {
      const res = await fetch(preset.url);
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
      data = await res.json();
    }
    const fn = new Function("data", "url", preset.transform);
    const result = fn(data, preset.url);
    if (!result || !Array.isArray(result.x) || !Array.isArray(result.y)) return;
    if (result.x.length === 0) return;
    manager.updateData(chart.chartId, { x: result.x, y: result.y });
    manager.resetView(chart.chartId);
    updateTilePoints(chart, result.x.length);
    chart.name = preset.name;
    const nameInput = chart.el.querySelector(".tile-name") as HTMLInputElement;
    if (nameInput) {
      nameInput.value = chart.name;
      const resizeFn = (chart.el as any)._resizeName;
      if (resizeFn) resizeFn();
    }
  } catch (err) {
    console.warn(`Failed to load preset "${preset.name}":`, err);
  }
}

function hideDataDialog() {
  document.getElementById("data-modal")!.classList.remove("open");
  modalTargetChart = null;
  selectedPresetName = null;
}

async function loadDataSource() {
  if (!modalTargetChart) return;
  const chart = modalTargetChart;
  const url = (
    document.getElementById("data-url") as HTMLInputElement
  ).value.trim();
  const transformCode = (
    document.getElementById("data-transform") as HTMLTextAreaElement
  ).value.trim();
  const errorEl = document.getElementById("data-error")!;

  errorEl.classList.add("hidden");

  if (!transformCode) {
    errorEl.textContent = "Please provide a transform function.";
    errorEl.classList.remove("hidden");
    return;
  }

  try {
    let data: any = null;
    if (url) {
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}`);
      data = await res.json();
    }

    // Execute transform
    const fn = new Function("data", "url", transformCode);
    const result = fn(data, url);

    // Validate result
    if (!result || !Array.isArray(result.x) || !Array.isArray(result.y)) {
      throw new Error("Transform must return { x: number[], y: number[] }");
    }
    if (result.x.length !== result.y.length) {
      throw new Error(
        `x and y arrays must be same length (got ${result.x.length} and ${result.y.length})`,
      );
    }
    if (result.x.length === 0) {
      throw new Error("Returned data is empty");
    }

    // Update chart data
    manager.updateData(chart.chartId, { x: result.x, y: result.y });
    manager.resetView(chart.chartId);

    // Update point count badge
    updateTilePoints(chart, result.x.length);

    // Auto-set chart title from preset name if still the default
    const isDefaultName = /^Chart \d+$/.test(chart.name);
    if (isDefaultName && selectedPresetName) {
      chart.name = selectedPresetName;
      const nameInput = chart.el.querySelector(
        ".tile-name",
      ) as HTMLInputElement;
      if (nameInput) {
        nameInput.value = chart.name;
        // Trigger auto-size
        const resizeFn = (chart.el as any)._resizeName;
        if (resizeFn) resizeFn();
      }
    }

    hideDataDialog();
  } catch (err: any) {
    errorEl.textContent = err.message || String(err);
    errorEl.classList.remove("hidden");
  }
}

function setupDataDialog() {
  document
    .getElementById("modal-close")!
    .addEventListener("click", hideDataDialog);
  document
    .getElementById("data-cancel")!
    .addEventListener("click", hideDataDialog);
  document
    .getElementById("data-load")!
    .addEventListener("click", loadDataSource);

  // Close on overlay click
  document.getElementById("data-modal")!.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      hideDataDialog();
    }
  });

  // Escape key closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.getElementById("data-modal")!.classList.contains("open")) {
        hideDataDialog();
      }
    }
  });
}

// ─── Toast ──────────────────────────────────────────────────────────────────

let toastTimer = 0;
function showToast(message: string, type: "error" | "success" = "error") {
  const el = document.getElementById("toast")!;
  el.textContent = message;
  el.style.background = type === "success" ? "var(--success)" : "var(--danger)";
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add("hidden"), 3000);
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

function setupToolbar() {
  const addBtn = document.getElementById("add-btn")!;
  const addMenu = document.getElementById("add-menu")!;

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addMenu.classList.toggle("open");
  });

  addMenu.querySelectorAll("button[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = (btn as HTMLElement).dataset.type as ChartType;
      addChartAuto(type);
      addMenu.classList.remove("open");
    });
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener("mousedown", (e) => {
    if (!(e.target as HTMLElement).closest("#add-dropdown")) {
      addMenu.classList.remove("open");
    }
  });

  // Sync toggle
  const syncToggle = document.getElementById("sync-toggle") as HTMLInputElement;
  const syncLabel = document.getElementById("sync-label")!;
  syncToggle.addEventListener("change", () => {
    const synced = syncToggle.checked;
    manager.setSyncViews(synced);
    syncLabel.textContent = synced ? "Synced" : "Sync Off";
  });

  // Add 5 random charts with random data sources
  document.getElementById("add-random-5")!.addEventListener("click", () => {
    const types: ChartType[] = ["line", "scatter", "bar"];
    for (let i = 0; i < 5; i++) {
      const preset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
      const type =
        preset.type || types[Math.floor(Math.random() * types.length)];
      const w = snap(DEFAULT_W);
      const h = snap(DEFAULT_H);
      const spot = findEmptySpot(w, h);
      addChartAt(type, spot.x + w / 2, spot.y + h / 2);
      const chart = charts[charts.length - 1];
      if (chart) loadPresetIntoChart(chart, preset);
    }
  });

  // Clear all
  document
    .getElementById("clear-all")!
    .addEventListener("click", clearAllCharts);
}

// ─── Main Thread Timing ─────────────────────────────────────────────────────

function setupMainThreadTiming() {
  let currentMainMs = 0;
  const channel = new MessageChannel();
  let frameT0 = 0;
  let lastDisplayUpdate = 0;

  channel.port1.onmessage = () => {
    currentMainMs = performance.now() - frameT0;
    const now = performance.now();
    if (now - lastDisplayUpdate >= 120) {
      lastDisplayUpdate = now;
      const fmt = (ms: number) =>
        ms < 1 ? ms.toFixed(2) + "ms" : ms.toFixed(1) + "ms";
      document.getElementById("main-ms")!.textContent = fmt(currentMainMs);
    }
  };

  function measureFrame() {
    requestAnimationFrame(() => {
      frameT0 = performance.now();
      channel.port2.postMessage(null);
      measureFrame();
    });
  }
  measureFrame();
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function setupStats() {
  manager.onStats((stats) => {
    document.getElementById("active")!.textContent = stats.active.toString();
    document.getElementById("total")!.textContent = stats.total.toString();
  });
}

// ─── Init ───────────────────────────────────────────────────────────────────

async function init() {
  manager = ChartManager.getInstance();

  const success = await manager.init();
  if (!success) {
    showToast("WebGPU not available. Please use a supported browser.", "error");
    return;
  }

  // Set dark theme on the library
  manager.setTheme(true);

  setupViewport();
  setupToolbar();
  setupDataDialog();
  setupMainThreadTiming();
  setupStats();

  // Add some initial charts
  setTimeout(() => {
    addChartAuto("line");
    addChartAuto("scatter");
    addChartAuto("bar");
  }, 100);
}

// ─── Hot Reload ─────────────────────────────────────────────────────────────

// Only enable hot reload in development
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  const ws = new WebSocket(`ws://${location.host}/__hot`);
  ws.onmessage = (e) => {
    if (e.data === "reload") location.reload();
  };
}

init();
