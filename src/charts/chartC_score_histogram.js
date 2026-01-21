import * as d3 from "d3";

const dimensions = {
  width: 520,
  height: 320,
  margin: { top: 28, right: 24, bottom: 64, left: 64 },
};

const binThresholds = d3.range(0, 101, 10);

let svg;
let plotArea;
let xScale;
let yScale;
let innerWidth = 0;
let innerHeight = 0;
let allData = [];
let allBins = [];
let binGenerator;
let baselineBars;
let selectedBars;
let countsLabel;
let tooltip;
let legendGroup;

function ensureTooltip() {
  if (!tooltip) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "chart-tooltip histogram-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("padding", "8px 10px")
      .style("background", "rgba(15, 23, 42, 0.9)")
      .style("color", "#f8fafc")
      .style("border-radius", "8px")
      .style("font-size", "12px")
      .style("line-height", "1.3")
      .style("box-shadow", "0 8px 24px rgba(15, 23, 42, 0.18)")
      .style("opacity", 0);
  }
}

function validData(data) {
  return (data || []).filter(d => Number.isFinite(d.score) && Number.isFinite(d.appid));
}

function formatTooltip(bin, selectedCount) {
  const rangeLabel = `${bin.x0}-${bin.x1}`;
  return `
    <div><strong>Score bin: ${rangeLabel}</strong></div>
    <div>All games: ${bin.length}</div>
    <div>Selected: ${selectedCount}</div>
  `;
}

function setupScales() {
  xScale = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);
  const yMax = d3.max(allBins, d => d.length) || 1;
  yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);
}

function drawAxes() {
  const { margin } = dimensions;
  const xAxis = d3.axisBottom(xScale).ticks(6);
  const yAxis = d3.axisLeft(yScale).ticks(6);

  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(${margin.left}, ${margin.top + innerHeight})`)
    .call(xAxis);

  svg.append("g").attr("class", "y-axis").attr("transform", `translate(${margin.left}, ${margin.top})`).call(yAxis);
}

function drawAxisLabels() {
  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", dimensions.margin.left + innerWidth / 2)
    .attr("y", dimensions.height - dimensions.margin.bottom / 2)
    .attr("text-anchor", "middle")
    .text("Metacritic Score");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr(
      "transform",
      `translate(${dimensions.margin.left / 2}, ${dimensions.margin.top + innerHeight / 2}) rotate(-90)`
    )
    .attr("text-anchor", "middle")
    .text("Count of games");
}

function drawCountLabel() {
  const group = svg
    .append("g")
    .attr("class", "count-label")
    .attr("transform", `translate(${dimensions.margin.left + 10}, ${dimensions.margin.top + 10})`);

  group
    .append("rect")
    .attr("width", 150)
    .attr("height", 44)
    .attr("rx", 8)
    .attr("fill", "rgba(255,255,255,0.86)")
    .attr("stroke", "#cbd5e1");

  countsLabel = group
    .append("text")
    .attr("x", 12)
    .attr("y", 18)
    .attr("font-size", 12)
    .attr("fill", "#0f172a");

  countsLabel
    .append("tspan")
    .attr("class", "count-all")
    .attr("x", 12)
    .attr("dy", 0)
    .text("");

  countsLabel
    .append("tspan")
    .attr("class", "count-selected")
    .attr("x", 12)
    .attr("dy", 16)
    .text("");
}

function drawLegend() {
  const legendWidth = 150;
  const legendHeight = 60;
  const x = dimensions.margin.left + 10;
  const y = dimensions.margin.top + 60;

  legendGroup = svg
    .append("g")
    .attr("class", "histogram-legend")
    .attr("transform", `translate(${x}, ${y})`)
    .attr("pointer-events", "none");

  legendGroup
    .append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("rx", 8)
    .attr("fill", "rgba(255,255,255,0.9)")
    .attr("stroke", "#cbd5e1");

  const items = [
    { label: "All games", fill: "#0ea5e9", opacity: 0.35, stroke: "none" },
    { label: "Selected games", fill: "#0f172a", opacity: 0.9, stroke: "#0f172a" },
  ];

  const itemGroup = legendGroup
    .selectAll(".legend-item")
    .data(items)
    .join("g")
    .attr("class", "legend-item")
    .attr("transform", (_, i) => `translate(12, ${16 + i * 20})`);

  itemGroup
    .append("rect")
    .attr("x", 0)
    .attr("y", -8)
    .attr("width", 14)
    .attr("height", 14)
    .attr("rx", 3)
    .attr("fill", d => d.fill)
    .attr("opacity", d => d.opacity)
    .attr("stroke", d => d.stroke);

  itemGroup
    .append("text")
    .attr("x", 24)
    .attr("y", 3)
    .attr("font-size", 12)
    .attr("fill", "#0f172a")
    .text(d => d.label);
}

export function render(containerSelector, state) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();
  ensureTooltip();

  allData = validData(state.data);
  const { width, height, margin } = dimensions;
  innerWidth = width - margin.left - margin.right;
  innerHeight = height - margin.top - margin.bottom;

  binGenerator = d3
    .bin()
    .domain([0, 100])
    .value(d => d.score)
    .thresholds(binThresholds);

  allBins = binGenerator(allData).map((bin, i) => {
    bin.index = i;
    return bin;
  });

  svg = container
    .append("svg")
    .attr("class", "chart-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  plotArea = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  plotArea
    .append("rect")
    .attr("class", "plot-backdrop")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("rx", 6)
    .attr("fill", "none")
    .attr("stroke", "#e2e8f0");

  setupScales();
  drawAxes();
  drawAxisLabels();
  drawCountLabel();
  drawLegend();

  const barWidth = Math.max(0, xScale(binThresholds[1]) - xScale(binThresholds[0]) - 2);

  const baselineGroup = plotArea.append("g").attr("class", "bars-all");
  baselineBars = baselineGroup
    .selectAll("rect")
    .data(allBins, d => d.index)
    .join("rect")
    .attr("x", d => xScale(d.x0) + 1)
    .attr("width", barWidth)
    .attr("y", d => yScale(d.length))
    .attr("height", d => innerHeight - yScale(d.length))
    .attr("fill", "#0ea5e9")
    .attr("opacity", 0.35)
    .attr("stroke", "none");

  const selectedGroup = plotArea.append("g").attr("class", "bars-selected");
  selectedBars = selectedGroup
    .selectAll("rect")
    .data(allBins, d => d.index)
    .join("rect")
    .attr("x", d => xScale(d.x0) + 1)
    .attr("width", barWidth)
    .attr("y", yScale(0))
    .attr("height", 0)
    .attr("fill", "#0f172a")
    .attr("opacity", 0.8)
    .attr("stroke", "#0f172a")
    .attr("pointer-events", "none");

  update(state);
}

export function update(state) {
  if (!binGenerator || !allBins || !selectedBars) return;

  const selectedIds = state.selectedIds || new Set();
  const hasSelection = selectedIds.size > 0;

  const selectedData = hasSelection
    ? allData.filter(d => selectedIds.has(d.appid))
    : [];

  const selectedBins = binGenerator(selectedData).map((bin, idx) => ({
    ...bin,
    selectedCount: bin.length,
    index: idx,
  }));

  const selectedCounts = selectedBins.map(bin => bin.selectedCount);

  selectedBars
    .data(selectedBins, d => d.index)
    .attr("y", d => yScale(d.selectedCount))
    .attr("height", d => innerHeight - yScale(d.selectedCount))
    .attr("opacity", hasSelection ? 0.9 : 0);

  baselineBars
    .data(allBins)
    .on("mouseenter", (event, d) => {
      const selectedCount = selectedCounts[d.index] ?? 0;
      tooltip.html(formatTooltip(d, selectedCount)).style("opacity", 1);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 12}px`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  if (countsLabel) {
    countsLabel.select(".count-all").text(`All games: ${allData.length}`);
    countsLabel.select(".count-selected").text(`Selected: ${hasSelection ? selectedIds.size : 0}`);
  }
}
