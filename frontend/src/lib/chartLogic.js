// Non-chart-rendering logic for the shared Chart component (see
// components/shared/Chart.js). Everything here is plain, chart.js-agnostic
// (or nearly so) data shaping and interaction-resolution: what a click means,
// what a popover should show, and how oversized bar series get compressed
// before they ever reach the canvas. Chart.js's own instance/canvas/zoom
// concerns stay out of this file.

// Two adjacent bars can sit close enough on screen that Chart.js's own
// nearest-index hit test picks whichever one the pointer happens to be a
// pixel closer to — including a visually-tiny bar right next to a tall one.
// This re-examines the immediate neighbors of that first guess and prefers
// the tallest (largest magnitude) one, but only within a small pixel
// tolerance around the click so it doesn't hijack clicks that are clearly on
// one specific bar.
export function resolveNearestBarIndex({ chart, datasetIndex, fallbackIndex, clickX, toleranceRatio = 0.6 }) {
  const dataset = chart.data.datasets[datasetIndex];
  const meta = chart.getDatasetMeta(datasetIndex);
  if (!dataset || !meta?.data?.length || fallbackIndex == null) return fallbackIndex;

  const anchor = meta.data[fallbackIndex];
  const refWidth = anchor?.width || 10;
  const candidates = [fallbackIndex - 1, fallbackIndex, fallbackIndex + 1].filter(
    (i) => i >= 0 && i < meta.data.length && dataset.data[i] != null
  );

  let best = fallbackIndex;
  let bestMagnitude = -Infinity;
  for (const i of candidates) {
    const point = meta.data[i];
    const dist = Math.abs((point?.x ?? 0) - clickX);
    if (dist > refWidth * toleranceRatio + refWidth / 2) continue;
    const magnitude = Math.abs(dataset.data[i] ?? 0);
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude;
      best = i;
    }
  }
  return best;
}

// Builds a position (1-based) -> value lookup from a flattened track's
// parallel `positions` (0-based) / `values` arrays, e.g. the output of
// `flattenProbaTrack`/`flattenDeltaTrack` in lib/sequence.js.
export function buildPositionValueMap(positions, values) {
  const map = new Map();
  (positions || []).forEach((p, i) => map.set(p + 1, values[i]));
  return map;
}

// Assembles the score rows a popover shows for a click at chart data-index
// `index` (1-based label `position`). `chartDatasets` are the *current*
// chart.js datasets (post-aggregation, if any) -- when a series was split
// into a "kept" + "compressed" pair (see aggregateBarSeries below) exactly
// one of the pair holds a non-null value at any given index, so the null
// filter below naturally collapses the pair back into one score row.
// `companionSeries` (from a sibling Chart instance, see item 7a) is looked
// up by real sequence position, not by chart index, since a companion chart
// may have compressed differently.
export function buildPopoverScores({ chartDatasets, index, companionSeries = [], position }) {
  // A "kept"/"compressed" aggregation pair (see aggregateBarSeries) shares
  // one label and is mutually exclusive at every slot -- at most one half
  // has a non-null value at `index` -- so filtering out nulls here already
  // collapses each pair back into a single score row.
  const own = chartDatasets
    .map((ds, i) => ({ label: ds.label || `Dataset ${i + 1}`, value: ds.data[index] }))
    .filter((s) => s.value != null);

  const companion = companionSeries
    .map((c) => ({ label: c.label, value: c.map.get(position) }))
    .filter((s) => s.value != null);

  return [...own, ...companion];
}

// Direct data extremes for the y-axis (item 7c) -- Chart.js's default
// auto-padded scale leaves a gap above the tallest bar/point; setting `max`
// (and `min`, for series that go negative) to the exact data extreme makes
// the outermost gridline land exactly on the tallest/most-negative bar.
export function computeYAxisExtent(datasets, { allowNegativeMin = false } = {}) {
  let max = -Infinity;
  let min = Infinity;
  for (const ds of datasets) {
    for (const v of ds.data || []) {
      if (v == null || Number.isNaN(v)) continue;
      if (v > max) max = v;
      if (v < min) min = v;
    }
  }
  if (max === -Infinity) return {};
  const extent = { max };
  if (allowNegativeMin && min < 0) extent.min = min;
  return extent;
}

// Item 7b: a bar chart with one bar per base position becomes unreadable
// once a sequence runs into the thousands of bases -- bars collapse below a
// visible pixel width and start overlapping. 500 is chosen as the trigger
// because a typical chart panel here is ~600-900px wide; below ~500 bars
// each still gets a handful of pixels and renders fine untouched (this is
// also comfortably above every built-in sample/short-sequence test case, so
// normal usage never touches this path). Above the threshold, only the
// `keepCount` largest-magnitude positions are kept as full-size bars; every
// run of positions in between (the "nothing interesting happening" stretch)
// collapses into a single thin placeholder bar at ~1/10th the normal bar
// width, positioned at that run's own largest-magnitude point so it still
// reports a real, correct sequence position if clicked.
const AGGREGATION_THRESHOLD = 500;
const AGGREGATION_KEEP_COUNT = 150;
const NORMAL_BAR_PX = 12;
const COMPRESSED_BAR_PX = Math.max(1, Math.round(NORMAL_BAR_PX / 10));

function remapArrayProp(value, indexMap, isCompressedAt) {
  if (!Array.isArray(value)) return value;
  return indexMap.map((realIdx, slot) => (isCompressedAt[slot] ? undefined : value[realIdx]));
}

export function aggregateBarSeries({ labels, datasets, threshold = AGGREGATION_THRESHOLD, keepCount = AGGREGATION_KEEP_COUNT }) {
  const n = labels.length;
  if (n <= threshold) {
    return { labels, datasets, indexMap: labels.map((_, i) => i) };
  }

  const importance = new Array(n).fill(0);
  for (const ds of datasets) {
    (ds.data || []).forEach((v, i) => {
      const mag = Math.abs(v) || 0;
      if (mag > importance[i]) importance[i] = mag;
    });
  }

  const keptSet = new Set(
    importance
      .map((mag, i) => [mag, i])
      .sort((a, b) => b[0] - a[0])
      .slice(0, Math.min(keepCount, n))
      .map(([, i]) => i)
  );

  const newLabels = [];
  const indexMap = [];
  const isCompressedAt = [];
  const keptData = datasets.map(() => []);
  const compressedData = datasets.map(() => []);

  let i = 0;
  while (i < n) {
    if (keptSet.has(i)) {
      newLabels.push(labels[i]);
      indexMap.push(i);
      isCompressedAt.push(false);
      datasets.forEach((ds, di) => {
        keptData[di].push(ds.data[i] ?? null);
        compressedData[di].push(null);
      });
      i++;
      continue;
    }
    let j = i;
    let peak = i;
    let peakMag = importance[i];
    while (j < n && !keptSet.has(j)) {
      if (importance[j] > peakMag) {
        peakMag = importance[j];
        peak = j;
      }
      j++;
    }
    newLabels.push(labels[peak]);
    indexMap.push(peak);
    isCompressedAt.push(true);
    datasets.forEach((ds, di) => {
      keptData[di].push(null);
      compressedData[di].push(ds.data[peak] ?? 0);
    });
    i = j;
  }

  const newDatasets = [];
  datasets.forEach((ds, di) => {
    newDatasets.push({
      ...ds,
      data: keptData[di],
      backgroundColor: remapArrayProp(ds.backgroundColor, indexMap, isCompressedAt),
      borderColor: remapArrayProp(ds.borderColor, indexMap, isCompressedAt),
      borderWidth: remapArrayProp(ds.borderWidth, indexMap, isCompressedAt),
      barThickness: NORMAL_BAR_PX,
    });
    newDatasets.push({
      ...ds,
      data: compressedData[di],
      backgroundColor: "#6b7280",
      borderColor: undefined,
      borderWidth: 0,
      barThickness: COMPRESSED_BAR_PX,
      _aggregatedGap: true,
    });
  });

  return { labels: newLabels, datasets: newDatasets, indexMap, isCompressedAt };
}
