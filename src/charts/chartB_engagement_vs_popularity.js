import * as d3 from "d3";

const USE_LOG_X = true;

const dimensions = {
  width: 520,
  height: 320,
  margin: { top: 28, right: 24, bottom: 64, left: 72 },
};

const STATS = { width: 170, height: 44 };

let svg;
let plotArea;
let xScale;
let yScale;
let pointsSel;
let pointsGroup;
let countsGroup;
let tooltip;
let innerWidth = 0;
let innerHeight = 0;
let allData = [];

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
    d =>
      Number.isFinite(d.appid) &&
      Number.isFinite(d.logOwners) &&
      Number.isFinite(d.median_playTime_total)
  );
}

function xValue(d) {
  const raw = d.median_playTime_total ?? 0;
  return USE_LOG_X ? Math.log10(raw + 1) : raw;
}

function formatTooltip(d) {
  return `
    <div><strong>${d.name || "Unknown"}</strong></div>
    <div>Median playtime (min): ${d.median_playTime_total ?? "?"}</div>
    <div>log10 owners: ${d.logOwners ?? "?"}</div>
    <div>Score: ${d.score ?? "n/a"}</div>
    <div>AppID: ${d.appid}</div>
  `;
}

function computeDomains(data) {
  const xExtent = d3.extent(data, d => xValue(d));
  const yExtent = d3.extent(data, d => d.logOwners);
  const xMin = Math.min(0, xExtent[0] ?? 0);
  const xMax = Math.max(xExtent[1] ?? 1, 1);
  const yMin = yExtent[0] ?? 0;
  const yMax = yExtent[1] ?? yMin + 1;
  return {
    x: [xMin, xMax],
    y: yMin === yMax ? [yMin - 0.5, yMax + 0.5] : [yMin, yMax],
  };
}

function drawAxes(domains) {
  xScale.domain(domains.x).range([0, innerWidth]).nice();
  yScale.domain(domains.y).range([innerHeight, 0]).nice();

  const xAxis = d3.axisBottom(xScale).ticks(6);
  const yAxis = d3.axisLeft(yScale).ticks(6);

  svg.select(".x-axis").call(xAxis);
  svg.select(".y-axis").call(yAxis);
}

function drawAxisLabels() {
  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", dimensions.margin.left + innerWidth / 2)
    .attr("y", dimensions.height - dimensions.margin.bottom / 2)
    .attr("text-anchor", "middle")
    .text(USE_LOG_X ? "Log10(Median Playtime Total + 1)" : "Median Playtime Total (min)");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr(
      "transform",
      `translate(${dimensions.margin.left / 2}, ${dimensions.margin.top + innerHeight / 2}) rotate(-90)`
    )
    .attr("text-anchor", "middle")
    .text("Log10 Estimated Owners");
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

  text.append("tspan").attr("class", "count-total").attr("x", 12).attr("dy", 0).text("");
  text.append("tspan").attr("class", "count-selected").attr("x", 12).attr("dy", 16).text("");
}

export function render(containerSelector, state) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();
  ensureTooltip();

  allData = validData(state.data);
  const { width, height, margin } = dimensions;
  innerWidth = width - margin.left - margin.right;
  innerHeight = height - margin.top - margin.bottom;

  const domains = computeDomains(allData);

  svg = container
    .append("svg")
    .attr("class", "chart-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  plotArea = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  xScale = d3.scaleLinear();
  yScale = d3.scaleLinear();

  plotArea
    .append("rect")
    .attr("class", "plot-backdrop")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("rx", 6)
    .attr("fill", "none")
    .attr("stroke", "#e2e8f0");

  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(${margin.left}, ${margin.top + innerHeight})`);

  svg.append("g").attr("class", "y-axis").attr("transform", `translate(${margin.left}, ${margin.top})`);

  drawAxes(domains);
  drawAxisLabels();
  drawCountLabel();

  pointsGroup = plotArea.append("g").attr("class", "points");
  pointsSel = pointsGroup
    .selectAll("circle")
    .data(allData, d => d.appid)
    .join("circle")
    .attr("cx", d => xScale(xValue(d)))
    .attr("cy", d => yScale(d.logOwners))
    .attr("r", 4)
    .attr("fill", "#0ea5e9")
    .attr("opacity", 0.6)
    .on("mouseenter", (event, d) => {
      tooltip.html(formatTooltip(d)).style("opacity", 1);
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
  if (!pointsGroup) return;

  const selectedIds = state.selectedIds || new Set();
  const hasSelection = selectedIds.size > 0;

  const displayData = hasSelection ? allData.filter(d => selectedIds.has(d.appid)) : allData;

  pointsSel = pointsGroup
    .selectAll("circle")
    .data(displayData, d => d.appid)
    .join(
      enter =>
        enter
          .append("circle")
          .attr("fill", "#0ea5e9")
          .attr("stroke", "none")
          .on("mouseenter", (event, d) => {
            tooltip.html(formatTooltip(d)).style("opacity", 1);
          })
          .on("mousemove", event => {
            tooltip
              .style("left", `${event.pageX + 12}px`)
              .style("top", `${event.pageY - 12}px`);
          })
          .on("mouseleave", () => tooltip.style("opacity", 0)),
      update => update,
      exit => exit.remove()
    )
    .attr("cx", d => xScale(xValue(d)))
    .attr("cy", d => yScale(d.logOwners))
    .attr("r", hasSelection ? 5 : 4)
    .attr("opacity", hasSelection ? 0.95 : 0.6)
    .attr("stroke", hasSelection ? "#0f172a" : "none");

  if (countsGroup) {
    countsGroup.select(".count-total").text(`All games: ${allData.length}`);
    countsGroup
      .select(".count-selected")
      .text(`Selected: ${hasSelection ? displayData.length : 0}`);
  }
}
