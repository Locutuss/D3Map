// example.js — minimal US states map


// Your URLs
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@2/us/10m.json';
const COUNTY_CO2_URL = 'https://raw.githubusercontent.com/Locutuss/D3Map/refs/heads/main/County_CO2.json';
// example.js — draw states from us-atlas v2 (preprojected)

const svg = d3.select('#map')
  .attr('viewBox', '0 0 975 610')          // key for v2
  .attr('preserveAspectRatio', 'xMidYMid meet');



(async function () {
  const topo = await d3.json(GEO_URL);

  // No projection needed for v2 — use a plain path
  const path = d3.geoPath();

  const states = topojson.feature(topo, topo.objects.states);

  // states fill
  svg.append('g')
    .selectAll('path')
    .data(states.features)
    .join('path')
      .attr('d', path)
      .attr('fill', '#e6edf5');

  // state borders
  svg.append('path')
    .datum(topojson.mesh(topo, topo.objects.states, (a, b) => a !== b))
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#ffffff');

  // optional: thin county lines on top
  const counties = topojson.mesh(topo, topo.objects.counties, (a, b) => a !== b);
  svg.append('path')
    .datum(counties)
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#bfc8d4')
    .attr('stroke-width', 0.3);

  

  // load CO2 data
  // --- Load your CO2 data and compare names to the Geo counties ---

  const COUNTY_CO2_URL = 'https://raw.githubusercontent.com/Locutuss/D3Map/refs/heads/main/County_CO2.json';

  // 1) Get county polygons as features so we can read their names
  const countyFeatures = topojson.feature(topo, topo.objects.counties).features;
  // After: const countyFeatures = topojson.feature(topo, topo.objects.counties).features;
  console.log('First county feature:', countyFeatures[0]);
  console.log('First county id:', countyFeatures[0].id);
  console.log('First county name prop:', countyFeatures[0].properties && countyFeatures[0].properties.name);
  
  // 2) Load your data
  const rows = await d3.json(COUNTY_CO2_URL);
  console.log('County_CO2 rows:', rows.length);

  // 3) Normalize names to improve matching
  const norm = s => String(s).toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*(COUNTY|PARISH|CENSUS AREA|BOROUGH|CITY|MUNICIPIO|MUNICIPALITY)\s*$/i, '');

  // Names from the map file
  const geoNames = new Set(countyFeatures.map(f => norm(f.properties.name)));

  // Names from your CO2 file
  const dataNames = new Set(rows.map(r => norm(r.County)));

  // 4) Quick overlap check
  const overlap = [...dataNames].filter(n => geoNames.has(n));
  const missing = [...dataNames].filter(n => !geoNames.has(n));


  svg.append('g')
  .selectAll('path')
  .data(countyFeatures)
  .join('path')
  .attr('d', path)
  .attr('fill', 'transparent')
  .attr('pointer-events', 'all')
  .on('mousemove', (event, d) => {
    const name = d.properties && d.properties.name ? d.properties.name : d.id;
    console.log(name);
  });


  console.log('Unique county names in Geo:', geoNames.size);
  console.log('Unique county names in Data:', dataNames.size);
  console.log('Overlapping names:', overlap.length);
  console.log('Sample not matched:', missing.slice(0, 20));


  // --- quick choropleth by county name (first pass) ---

// 1) Reuse features and rows you already loaded
// countyFeatures: from topojson.feature(topo, topo.objects.counties).features
// rows: from d3.json(COUNTY_CO2_URL)

// 2) Slightly stronger normalization for common variants
const norm2 = s => String(s).toUpperCase()
  .replace(/[\.\']/g, '')              // drop periods and apostrophes (ST., O'BRIEN)
  .replace(/\s+/g, ' ')                // collapse spaces
  .replace(/\bSAINT\b/g, 'ST')         // SAINT -> ST
  .replace(/\bSTE\b/g, 'ST')           // Sainte -> Ste -> St
  .replace(/\bDE\s+KALB\b/g, 'DEKALB') // DE KALB -> DEKALB
  .replace(/\s*(COUNTY|PARISH|CENSUS AREA|BOROUGH|CITY|MUNICIPIO|MUNICIPALITY)\s*$/i, '')
  .trim();

// 3) Build a lookup from county name -> value (take first if duplicates)
const toNum = x => {
  const v = +x;
  return Number.isFinite(v) ? v : NaN;
};

// put near your normalization helpers
;

const aliasNorm = s => {
  const n = norm2(s);
  const a = ALIAS.get(n);
  return a ? norm2(a) : n;
};




const dataByName = new Map();
for (const r of rows) {
  const k = norm2(r.County);
  if (!dataByName.has(k)) {
    dataByName.set(k, toNum(r['Total County Carbon Footprint (tCO2e/yr)']));
  }
}

// values that actually matched
const matchedVals = countyFeatures
  .map(f => dataByName.get(norm2(f.properties.name)))
  .filter(Number.isFinite);

// focus on the middle 90% for better contrast
const lo = d3.quantile(matchedVals, 0.10);
const hi = d3.quantile(matchedVals, 0.90);

// higher-contrast palette also helps (Plasma or Viridis)
const color = d3.scaleSequential(d3.interpolateCividis)
  .domain([lo, hi])
  .clamp(true);


// 5) Draw filled counties (leave non-matches light gray)
svg.append('g')
  .selectAll('path')
  .data(countyFeatures)
  .join('path')
    .attr('d', path)
    .attr('fill', d => {
      const v = dataByName.get(norm2(d.properties.name));
      return Number.isFinite(v) ? color(v) : '#eeeeee';
    })
  .append('title')
    .text(d => {
      const name = d.properties.name;
      const v = dataByName.get(norm2(name));
      return Number.isFinite(v) ? `${name}: ${v.toFixed(0)} tCO2e/yr` : `${name}: no data`;
    })
    
    // --- super simple legend (top-left) ---
const [min, max] = color.domain();
const legend = svg.append('g').attr('transform', 'translate(630,40)');

// gradient
const defs = svg.append('defs');
const grad = defs.append('linearGradient').attr('id', 'grad');
grad.append('stop').attr('offset', '0%').attr('stop-color', color(min));
grad.append('stop').attr('offset', '100%').attr('stop-color', color(max));

legend.append('rect')
  .attr('width', 160)
  .attr('height', 10)
  .attr('fill', 'url(#grad)')
  .attr('rx', 4);

legend.append('text')
  .attr('y', -6)
  .attr('font-size', 12)
  .attr('fill', '#444')
  .text('Total County Carbon Footprint (tCO2e/yr)');

legend.append('text')
  .attr('y', 24)
  .attr('font-size', 12)
  .attr('fill', '#444')
  .text(d3.format('~s')(min));

legend.append('text')
  .attr('x', 160)
  .attr('y', 24)
  .attr('text-anchor', 'end')
  .attr('font-size', 12)
  .attr('fill', '#444')
  .text(d3.format('~s')(max));
  
;






})();


