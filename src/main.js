import * as d3 from "d3";
import "./style.css";

import { render as renderChartA, update as updateChartA } from "./charts/chartA_score_vs_popularity";
import { render as renderChartB, update as updateChartB } from "./charts/chartB_engagement_vs_popularity";
import { render as renderChartC, update as updateChartC } from "./charts/chartC_score_histogram";
import { render as renderChartD, update as updateChartD } from "./charts/chartD_bubble_reviews_sentiment";
import { render as renderChartE, update as updateChartE } from "./charts/chartE_posratio_vs_popularity";

const chartRegistry = [
  { selector: "#chart-a", render: renderChartA, update: updateChartA },
  { selector: "#chart-b", render: renderChartB, update: updateChartB },
  { selector: "#chart-c", render: renderChartC, update: updateChartC },
  { selector: "#chart-d", render: renderChartD, update: updateChartD },
  { selector: "#chart-e", render: renderChartE, update: updateChartE },
];

const state = {
  data: [],
  selectedIds: new Set(),
  setSelected(ids) {
    state.selectedIds = new Set(ids ?? []);
    notifyUpdates();
  },
  clearSelected() {
    state.selectedIds = new Set();
    notifyUpdates();
  },
};

function notifyUpdates() {
  chartRegistry.forEach(({ update }) => update(state));
}

function renderAllCharts() {
  chartRegistry.forEach(({ selector, render }) => render(selector, state));
}

function wireControls() {
  const resetButton = document.querySelector("#reset-selection");
  if (resetButton) {
    resetButton.addEventListener("click", () => state.clearSelected());
  }
}

async function init() {
  wireControls();
  try {
    const data = await d3.json("/games_dashboard_data.json");
    state.data = Array.isArray(data) ? data : [];
    renderAllCharts();
    notifyUpdates();
  } catch (error) {
    console.error("Failed to load dashboard data:", error);
  }
}

init();
