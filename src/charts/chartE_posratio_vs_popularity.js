import * as d3 from "d3";

const dimensions = {
  width: 520,
  height: 320,
  margin: { top: 28, right: 24, bottom: 64, left: 72 },
};

const STATS = { width: 170, height: 44 };
const REG_BOX = { width: 170, height: 32 };

let svg;
let plotArea;
let xScale;
let yScale;
let pointsGroup;
let pointsSel;
let countsGroup;
let statsGroup;
let regressionLine;
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
    d => Number.isFinite(d.appid) && Number.isFinite(d.posRatio) && Number.isFinite(d.logOwners)
  );
}

function formatTooltip(d) {
  const posPercent = Number.isFinite(d.posRatio) ? `${(d.posRatio * 100).toFixed(1)}%` : "n/a";
  return `
    <div><strong>${d.name || "Unknown"}</strong></div>
    <div>Positive ratio: ${posPercent}</div>
    <div>log10 owners: ${d.logOwners ?? "?"}</div>
    <div>Score: ${d.score ?? "n/a"}</div>
    <div>AppID: ${d.appid}</div>
  `;
}

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const p of points) {
    const x = p.posRatio;
    const y = p.logOwners;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumX2 - n * meanX * meanX;
  if (denom === 0) return null;
  const slope = (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const yHat = intercept + slope * p.posRatio;
    ssRes += (p.logOwners - yHat) ** 2;
    ssTot += (p.logOwners - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2, n };
}

function regressionLineCoords(reg, xDomain) {
  const [x0, x1] = xDomain;
  return [
    { x: x0, y: reg.intercept + reg.slope * x0 },
    { x: x1, y: reg.intercept + reg.slope * x1 },
  ];
}

function computeDomains(data) {
  const xDomain = [0, 1];
  const yExtent = d3.extent(data, d => d.logOwners);
  const yMin = yExtent[0] ?? 0;
  const yMax = yExtent[1] ?? yMin + 1;
  return {
    x: xDomain,
    y: yMin === yMax ? [yMin - 0.5, yMax + 0.5] : [yMin, yMax],
  };
}

function drawAxes(domains) {
  xScale.domain(domains.x).range([0, innerWidth]).nice();
  yScale.domain(domains.y).range([innerHeight, 0]).nice();

  const xAxis = d3.axisBottom(xScale).ticks(6).tickFormat(d3.format(".0%"));
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
    .text("Positive Review Ratio");

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

  text.append("tspan").attr("class", "count-all").attr("x", 12).attr("dy", 0).text("");
  text.append("tspan").attr("class", "count-selected").attr("x", 12).attr("dy", 16).text("");
}

function drawRegressionStatsBox() {
  const x = dimensions.margin.left + 8;
  const y = dimensions.margin.top + STATS.height + 16;

  statsGroup = svg
    .append("g")
    .attr("class", "regression-stats")
    .attr("transform", `translate(${x}, ${y})`);

  statsGroup
    .append("rect")
    .attr("width", REG_BOX.width)
    .attr("height", REG_BOX.height)
    .attr("rx", 8)
    .attr("fill", "rgba(255,255,255,0.9)")
    .attr("stroke", "#cbd5e1");

  const text = statsGroup
    .append("text")
    .attr("x", 12)
    .attr("y", 20)
    .attr("font-size", 12)
    .attr("fill", "#0f172a");

  text.append("tspan").attr("class", "reg-detail").attr("x", 12).attr("dy", 0);
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

  const domains = computeDomains(allData);

  svg = container
    .append("svg")
    .attr("class", "chart-svg")
    .attr("viewBox", `0 0 ${effectiveWidth} ${effectiveHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("width", effectiveWidth)
    .attr("height", effectiveHeight);

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
  drawRegressionStatsBox();

  pointsGroup = plotArea.append("g").attr("class", "points");

  regressionLine = plotArea
    .append("line")
    .attr("class", "regression-line")
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 2)
    .attr("opacity", 0.85);

  pointsSel = pointsGroup
    .selectAll("circle")
    .data(allData, d => d.appid)
    .join("circle")
    .attr("cx", d => xScale(d.posRatio))
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

  const domains = computeDomains(displayData.length ? displayData : allData);
  drawAxes(domains);

  pointsSel = pointsGroup
    .selectAll("circle")
    .data(displayData, d => d.appid)
    .join(
      enter =>
        enter
          .append("circle")
          .attr("fill", "#0ea5e9")
          .attr("stroke", hasSelection ? "#0f172a" : "none")
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
    .attr("cx", d => xScale(d.posRatio))
    .attr("cy", d => yScale(d.logOwners))
    .attr("r", hasSelection ? 5 : 4)
    .attr("opacity", hasSelection ? 0.95 : 0.6)
    .attr("stroke", hasSelection ? "#0f172a" : "none");

  const regData = hasSelection ? displayData : allData;
  const reg =
    hasSelection && regData.length < 20
      ? null
      : linearRegression(regData.filter(d => Number.isFinite(d.posRatio) && Number.isFinite(d.logOwners)));

  if (reg) {
    const coords = regressionLineCoords(reg, xScale.domain());
    regressionLine
      .attr("x1", xScale(coords[0].x))
      .attr("y1", yScale(coords[0].y))
      .attr("x2", xScale(coords[1].x))
      .attr("y2", yScale(coords[1].y))
      .attr("opacity", 0.9);
  } else {
    regressionLine.attr("opacity", 0);
  }

  if (countsGroup) {
    countsGroup.select(".count-all").text(`All games: ${allData.length}`);
    countsGroup.select(".count-selected").text(`Selected: ${hasSelection ? displayData.length : 0}`);
  }

  if (statsGroup) {
    const detail = statsGroup.select(".reg-detail");
    if (reg) {
      detail.text(`R²: ${reg.r2.toFixed(3)}`);
    } else {
      detail.text(regData.length >= 1 ? "R²: n/a (need ≥20 pts)" : "R²: n/a");
    }
  }
}
