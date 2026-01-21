import * as d3 from "d3";

const dimensions = {
  width: 520,
  height: 320,
  margin: { top: 28, right: 24, bottom: 64, left: 72 },
};

let svg;
let plotArea;
let xScale;
let yScale;
let pointsSel;
let brushLayer;
let globalRegressionLine;
let selectedRegressionLine;
let statsGroup;
let tooltip;
let innerWidth = 0;
let innerHeight = 0;
let brush;
let clipId = "chart-a-clip";

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

function formatTooltip(d) {
  return `
    <div><strong>${d.name || "Unknown"}</strong></div>
    <div>Score: ${d.score ?? "?"}</div>
    <div>log10 owners: ${d.logOwners ?? "?"}</div>
    <div>AppID: ${d.appid}</div>
  `;
}

function validData(data) {
  return (data || []).filter(
    d => Number.isFinite(d.score) && Number.isFinite(d.logOwners) && Number.isFinite(d.appid)
  );
}

function computeDomains(data) {
  const xExtent = d3.extent(data, d => d.score);
  const yExtent = d3.extent(data, d => d.logOwners);
  const xMin = Math.min(0, xExtent[0] ?? 0);
  const xMax = Math.max(100, xExtent[1] ?? 100);
  const yMin = yExtent[0] ?? 0;
  const yMax = yExtent[1] ?? yMin + 1;
  return {
    x: [xMin, xMax],
    y: yMin === yMax ? [yMin - 0.5, yMax + 0.5] : [yMin, yMax],
  };
}

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const p of points) {
    const x = p.score;
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
    const yHat = intercept + slope * p.score;
    ssRes += (p.logOwners - yHat) ** 2;
    ssTot += (p.logOwners - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2, n };
}

function regressionLineCoords({ slope, intercept }, xDomain) {
  const [x0, x1] = xDomain;
  return [
    { x: x0, y: intercept + slope * x0 },
    { x: x1, y: intercept + slope * x1 },
  ];
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
    .attr("y", dimensions.margin.top + innerHeight + 36)
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
    .text("Log10 Estimated Owners");
}

function setupClip() {
  const defs = svg.append("defs");
  defs
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", innerHeight);
}

function drawStatsBox(globalReg) {
  statsGroup = svg
    .append("g")
    .attr("class", "stats-box")
    .attr("transform", `translate(${dimensions.margin.left + 8}, ${dimensions.margin.top + 8})`);

  statsGroup
    .append("rect")
    .attr("width", 200)
    .attr("height", 70)
    .attr("rx", 8)
    .attr("fill", "rgba(255,255,255,0.86)")
    .attr("stroke", "#cbd5e1");

  statsGroup
    .append("text")
    .attr("class", "stats-text")
    .attr("x", 12)
    .attr("y", 20)
    .attr("font-size", 12)
    .attr("fill", "#0f172a");

  statsGroup
    .append("text")
    .attr("class", "stats-subtext")
    .attr("x", 12)
    .attr("y", 40)
    .attr("font-size", 12)
    .attr("fill", "#334155");

  statsGroup
    .append("text")
    .attr("class", "stats-global")
    .attr("x", 12)
    .attr("y", 60)
    .attr("font-size", 11)
    .attr("fill", "#64748b")
    .text(
      globalReg
        ? `Global fit: slope ${globalReg.slope.toFixed(3)}, intercept ${globalReg.intercept.toFixed(
            3
          )}, R² ${globalReg.r2.toFixed(3)}`
        : "Global fit unavailable"
    );
}

function handleBrushEnd(event, data, state) {
  const selection = event.selection;
  if (!selection) {
    state.clearSelected();
    return;
  }

  const [[x0, y0], [x1, y1]] = selection;
  const brushed = data.filter(d => {
    const x = xScale(d.score);
    const y = yScale(d.logOwners);
    return x0 <= x && x <= x1 && y0 <= y && y <= y1;
  });

  if (brushed.length === 0) {
    state.clearSelected();
    return;
  }

  const ids = new Set(brushed.map(d => d.appid));
  state.setSelected(ids);
}

function updateStats(selectedReg, selectionSize, totalSize, globalReg) {
  if (!statsGroup) return;
  const header = statsGroup.select(".stats-text");
  const detail = statsGroup.select(".stats-subtext");

  header.text(`n selected: ${selectionSize} / ${totalSize}`);

  if (!selectedReg) {
    detail.text("Select at least 20 points to fit");
  } else {
    detail.text(
      `Selected fit: slope ${selectedReg.slope.toFixed(3)}, R² ${selectedReg.r2.toFixed(3)}`
    );
  }

  statsGroup
    .select(".stats-global")
    .text(
      globalReg
        ? `Global fit: slope ${globalReg.slope.toFixed(3)}, R² ${globalReg.r2.toFixed(3)}`
        : "Global fit unavailable"
    );
}

export function render(containerSelector, state) {
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();
  ensureTooltip();

  const data = validData(state.data);

  const containerNode = container.node();
  const bbox = containerNode?.getBoundingClientRect();
  const effectiveWidth = bbox?.width && bbox.width > 0 ? bbox.width : dimensions.width;
  const effectiveHeight = bbox?.height && bbox.height > 0 ? bbox.height : dimensions.height + 120;
  const { margin } = dimensions;
  innerWidth = effectiveWidth - margin.left - margin.right;
  innerHeight = effectiveHeight - margin.top - margin.bottom;

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

  setupClip();

  plotArea
    .append("rect")
    .attr("class", "plot-backdrop")
    .attr("width", innerWidth)
    .attr("height", innerHeight)
    .attr("fill", "none")
    .attr("stroke", "#e2e8f0")
    .attr("rx", 6);

  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(${margin.left}, ${margin.top + innerHeight})`);

  svg.append("g").attr("class", "y-axis").attr("transform", `translate(${margin.left}, ${margin.top})`);

  const domains = computeDomains(data);
  drawAxes(domains);
  drawAxisLabels();

  const pointGroup = plotArea.append("g").attr("clip-path", `url(#${clipId})`);
  pointsSel = pointGroup
    .append("g")
    .attr("class", "points")
    .selectAll("circle")
    .data(data, d => d.appid)
    .join("circle")
    .attr("cx", d => xScale(d.score))
    .attr("cy", d => yScale(d.logOwners))
    .attr("r", 4)
    .attr("fill", "#0ea5e9")
    .attr("opacity", 0.55)
    .on("mouseenter", (event, d) => {
      tooltip.html(formatTooltip(d)).style("opacity", 1);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 12}px`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  const globalReg = linearRegression(data);
  const globalCoords = globalReg ? regressionLineCoords(globalReg, xScale.domain()) : null;
  const lineLayer = plotArea.append("g").attr("clip-path", `url(#${clipId})`);

  globalRegressionLine = lineLayer
    .append("line")
    .attr("class", "global-regression")
    .attr("stroke", "#94a3b8")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 4")
    .attr("opacity", 0.7);

  if (globalCoords) {
    globalRegressionLine
      .attr("x1", xScale(globalCoords[0].x))
      .attr("y1", yScale(globalCoords[0].y))
      .attr("x2", xScale(globalCoords[1].x))
      .attr("y2", yScale(globalCoords[1].y));
  }

  // Regression for brushed selection is updated on interaction.
  selectedRegressionLine = lineLayer
    .append("line")
    .attr("class", "selected-regression")
    .attr("stroke", "#0f172a")
    .attr("stroke-width", 3)
    .attr("opacity", 0);

  drawStatsBox(globalReg);

  // Brushing drives linked selection across charts.
  brush = d3
    .brush()
    .extent([
      [0, 0],
      [innerWidth, innerHeight],
    ])
    .on("end", event => handleBrushEnd(event, data, state));

  brushLayer = plotArea.append("g").attr("class", "brush").attr("clip-path", `url(#${clipId})`);
  brushLayer.call(brush);

  update(state);
}

export function update(state) {
  if (!pointsSel || !xScale || !yScale) return;

  const selectedIds = state.selectedIds || new Set();
  const hasSelection = selectedIds.size > 0;

  pointsSel.attr("opacity", d => {
    if (!hasSelection) return 0.6;
    return selectedIds.has(d.appid) ? 0.9 : 0.15;
  });

  if (!hasSelection && brushLayer && brush) {
    const existingBrush = d3.brushSelection(brushLayer.node());
    if (existingBrush) {
      brushLayer.call(brush.move, null);
    }
  }

  const data = pointsSel.data();
  const selectedData = hasSelection ? data.filter(d => selectedIds.has(d.appid)) : [];

  const selectedReg =
    hasSelection && selectedData.length >= 20 ? linearRegression(selectedData) : null;

  if (selectedReg) {
    const coords = regressionLineCoords(selectedReg, xScale.domain());
    selectedRegressionLine
      .attr("x1", xScale(coords[0].x))
      .attr("y1", yScale(coords[0].y))
      .attr("x2", xScale(coords[1].x))
      .attr("y2", yScale(coords[1].y))
      .attr("opacity", 0.95);
  } else {
    selectedRegressionLine.attr("opacity", 0);
  }

  const globalReg = linearRegression(data);
  updateStats(selectedReg, selectedData.length, data.length, globalReg);
}
