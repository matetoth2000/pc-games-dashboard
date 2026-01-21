import * as d3 from "d3";

const dimensions = {
  width: 520,
  height: 320,
  margin: { top: 28, right: 24, bottom: 64, left: 72 },
};

const STATS = { width: 170, height: 44 };
const BIN_WIDTH = 0.05;

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
let tooltip;
let countsGroup;

function ensureTooltip() {
  if (!tooltip) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "chart-tooltip")
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
  return (data || []).filter(
    d => Number.isFinite(d.appid) && Number.isFinite(d.posRatio) && d.posRatio >= 0 && d.posRatio <= 1
  );
}

function formatTooltip(bin, selectedCount) {
  const rangeLabel = `${bin.x0.toFixed(2)}–${bin.x1.toFixed(2)}`;
  return `
    <div><strong>Positive ratio: ${rangeLabel}</strong></div>
    <div>All games: ${bin.length}</div>
    <div>Selected: ${selectedCount}</div>
  `;
}

function setupScales() {
  xScale = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const yMax = d3.max(allBins, d => d.length) || 1;
  yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);
}

function drawAxes() {
  const { margin } = dimensions;
  const xAxis = d3.axisBottom(xScale).ticks(6).tickFormat(d3.format(".0%"));
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
    .attr("y", dimensions.margin.top + innerHeight + 36)
    .attr("text-anchor", "middle")
    .text("Positive Review Ratio");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr(
      "transform",
      `translate(${dimensions.margin.left / 2}, ${dimensions.margin.top + innerHeight / 2}) rotate(-90)`
    )
    .attr("text-anchor", "middle")
    .text("Number of Games");
}

function drawCountLabel() {
  const x = dimensions.margin.left + 8;
  const y = dimensions.margin.top + 8;

  countsGroup = svg
    .append("g")
    .attr("class", "count-label")
    .attr("transform", `translate(${x}, ${y})`);

  countsGroup
    .append("rect")
    .attr("width", STATS.width)
    .attr("height", STATS.height)
    .attr("rx", 8)
    .attr("fill", "rgba(255,255,255,0.86)")
    .attr("stroke", "#cbd5e1");

  const text = countsGroup
    .append("text")
    .attr("x", 12)
    .attr("y", 18)
    .attr("font-size", 12)
    .attr("fill", "#0f172a");

  text.append("tspan").attr("class", "count-all").attr("x", 12).attr("dy", 0).text("");
  text.append("tspan").attr("class", "count-selected").attr("x", 12).attr("dy", 16).text("");
}

export function render(containerSelector, state) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();
  ensureTooltip();

  allData = validData(state.data);
  const containerNode = container.node();
  const bbox = containerNode?.getBoundingClientRect();
  const effectiveWidth = bbox?.width && bbox.width > 0 ? bbox.width : dimensions.width;
  const effectiveHeight = bbox?.height && bbox.height > 0 ? bbox.height : dimensions.height;
  const { margin } = dimensions;
  innerWidth = effectiveWidth - margin.left - margin.right;
  innerHeight = effectiveHeight - margin.top - margin.bottom;

  binGenerator = d3
    .bin()
    .domain([0, 1])
    .thresholds(d3.range(0, 1 + BIN_WIDTH, BIN_WIDTH))
    .value(d => d.posRatio);

  allBins = binGenerator(allData).map((bin, i) => {
    bin.index = i;
    return bin;
  });

  svg = container
    .append("svg")
    .attr("class", "chart-svg")
    .attr("viewBox", `0 0 ${effectiveWidth} ${effectiveHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("width", effectiveWidth)
    .attr("height", effectiveHeight);

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

  const barWidth = Math.max(0, xScale(BIN_WIDTH) - xScale(0) - 2);

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
    .attr("opacity", 0)
    .attr("stroke", "#0f172a")
    .attr("pointer-events", "none");

  baselineBars
    .on("mouseenter", (event, d) => {
      const selCount = selectedBars.data()[d.index]?.selectedCount ?? 0;
      tooltip.html(formatTooltip(d, selCount)).style("opacity", 1);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 12}px`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  update(state);
}

export function update(state) {
  if (!binGenerator || !baselineBars || !selectedBars) return;

  const selectedIds = state.selectedIds || new Set();
  const hasSelection = selectedIds.size > 0;

  const selectedData = hasSelection ? allData.filter(d => selectedIds.has(d.appid)) : [];
  const selectedBins = binGenerator(selectedData).map((bin, i) => ({
    ...bin,
    selectedCount: bin.length,
    index: i,
  }));

  const selectedCounts = selectedBins.map(b => b.selectedCount);

  selectedBars
    .data(selectedBins, d => d.index)
    .attr("y", d => yScale(d.selectedCount))
    .attr("height", d => innerHeight - yScale(d.selectedCount))
    .attr("opacity", hasSelection ? 0.9 : 0);

  baselineBars
    .data(allBins)
    .on("mouseenter", (event, d) => {
      const selCount = selectedCounts[d.index] ?? 0;
      tooltip.html(formatTooltip(d, selCount)).style("opacity", 1);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 12}px`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  if (countsGroup) {
    countsGroup.select(".count-all").text(`All games: ${allData.length}`);
    countsGroup.select(".count-selected").text(`Selected: ${hasSelection ? selectedData.length : 0}`);
  }
}
