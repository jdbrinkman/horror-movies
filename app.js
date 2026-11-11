// Horror Movie Dashboard
// Flow: load data -> fill the filter controls -> render() on every change.
// render() filters the movies, then updates the KPIs, charts and table.

const DATA_URL = "data/movies.json";
const POSTER_BASE = "https://image.tmdb.org/t/p/w92"; // TMDB image host

let allMovies = [];
let shownIds = new Set(); // ids of the movies currently shown in the top-rated table
let spinning = false;
const charts = {}; // keep Chart.js instances so we can update (not recreate) them

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const fmtInt = (n) => n.toLocaleString("en-US");
const fmtMoney = (n) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${fmtInt(Math.round(n))}`;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

// Count occurrences: ["a","b","a"] -> Map {a:2, b:1}
function countBy(items, keyFn) {
  const m = new Map();
  for (const item of items) {
    const k = keyFn(item);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// ---------- Filters ----------
function readFilters() {
  return {
    yearFrom: Number($("filter-year-from").value),
    yearTo: Number($("filter-year-to").value),
    genre: $("filter-genre").value, // "" = all
    language: $("filter-language").value, // "" = all
    minVotes: Number($("filter-min-votes").value),
  };
}

function applyFilters(movies, f) {
  return movies.filter(
    (m) =>
      m.year >= f.yearFrom &&
      m.year <= f.yearTo &&
      (!f.genre || m.genres.includes(f.genre)) &&
      (!f.language || m.language === f.language)
  );
}

function setupFilters() {
  const years = allMovies.map((m) => m.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const yearOptions = [];
  for (let y = minYear; y <= maxYear; y++) yearOptions.push(`<option value="${y}">${y}</option>`);
  $("filter-year-from").innerHTML = yearOptions.join("");
  $("filter-year-to").innerHTML = yearOptions.join("");

  const genreCounts = countBy(allMovies.flatMap((m) => m.genres), (g) => g);
  const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  $("filter-genre").innerHTML =
    `<option value="">All sub-genres</option>` + genres.map((g) => `<option>${g}</option>`).join("");

  // Top 12 languages by movie count; language codes are shown as-is (en, es, ja...)
  const langCounts = [...countBy(allMovies, (m) => m.language).entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  $("filter-language").innerHTML =
    `<option value="">All languages</option>` +
    langCounts.map(([l, n]) => `<option value="${l}">${l} (${fmtInt(n)})</option>`).join("");

  resetFilters(minYear, maxYear);

  for (const id of ["filter-year-from", "filter-year-to", "filter-genre", "filter-language", "filter-min-votes"]) {
    $(id).addEventListener("input", render);
  }
  $("reset").addEventListener("click", () => {
    resetFilters(minYear, maxYear);
    render();
  });
}

function resetFilters(minYear, maxYear) {
  $("filter-year-from").value = minYear;
  $("filter-year-to").value = maxYear;
  $("filter-genre").value = "";
  $("filter-language").value = "";
  $("filter-min-votes").value = 25;
}

// ---------- Charts ----------
const RED = "#d6283b";
const RED_SOFT = "rgba(214, 40, 59, 0.55)";
const GRID = "rgba(255,255,255,0.07)";
const TICK = "#9a8e90";

Chart.defaults.color = TICK;
Chart.defaults.font.family = "system-ui, -apple-system, sans-serif";

function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: GRID }, ticks: { color: TICK } },
      y: { grid: { color: GRID }, ticks: { color: TICK }, beginAtZero: true },
    },
    ...extra,
  };
}

// Create the chart the first time, then just swap its data afterwards.
function upsertChart(key, canvasId, config) {
  if (charts[key]) {
    charts[key].data = config.data;
    charts[key].update();
  } else {
    charts[key] = new Chart($(canvasId), config);
  }
}

function sortedYears(movies) {
  return [...new Set(movies.map((m) => m.year))].sort((a, b) => a - b);
}

function renderPerYear(movies) {
  const counts = countBy(movies, (m) => m.year);
  const years = sortedYears(movies);
  upsertChart("perYear", "chart-per-year", {
    type: "bar",
    data: { labels: years, datasets: [{ data: years.map((y) => counts.get(y)), backgroundColor: RED_SOFT }] },
    options: baseOptions(),
  });
}

function renderRating(rated) {
  const byYear = new Map();
  for (const m of rated) {
    if (!byYear.has(m.year)) byYear.set(m.year, []);
    byYear.get(m.year).push(m.rating);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const opts = baseOptions();
  opts.scales.y = { ...opts.scales.y, beginAtZero: false, min: 1, max: 10 };
  upsertChart("rating", "chart-rating", {
    type: "line",
    data: {
      labels: years,
      datasets: [{ data: years.map((y) => mean(byYear.get(y))), borderColor: RED, backgroundColor: RED_SOFT, pointRadius: 2, tension: 0.25 }],
    },
    options: opts,
  });
}

function renderGenres(movies) {
  // Each movie lists its other genres (Horror is already removed).
  // Counting the whole list at once shows common *combinations*, e.g. "Horror + Thriller".
  const counts = countBy(movies, (m) => (m.genres.length ? m.genres.join(" + ") : "Horror only"));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  upsertChart("genres", "chart-genres", {
    type: "bar",
    data: { labels: top.map(([k]) => k), datasets: [{ data: top.map(([, n]) => n), backgroundColor: RED_SOFT }] },
    options: baseOptions({ indexAxis: "y" }),
  });
}

function renderRuntime(movies) {
  // Buckets of 15 minutes, from 0 up to 180+ (everything longer lands in the last bucket)
  const BIN = 15, MAX = 180;
  const bins = new Array(MAX / BIN + 1).fill(0);
  for (const m of movies) {
    if (!m.runtime) continue;
    bins[Math.min(Math.floor(m.runtime / BIN), MAX / BIN)]++;
  }
  const labels = bins.map((_, i) => (i === bins.length - 1 ? `${MAX}+` : `${i * BIN}–${i * BIN + BIN - 1}`));
  upsertChart("runtime", "chart-runtime", {
    type: "bar",
    data: { labels, datasets: [{ data: bins, backgroundColor: RED_SOFT }] },
    options: baseOptions(),
  });
}

function renderMoney(movies) {
  const withMoney = movies.filter((m) => m.budget && m.revenue);
  const opts = baseOptions();
  const logAxis = (title) => ({
    type: "logarithmic",
    grid: { color: GRID },
    // Log axes get lots of in-between ticks (2, 3, 4...); only label powers of 10
    ticks: { color: TICK, callback: (v) => (Math.log10(v) % 1 === 0 ? fmtMoney(v) : "") },
    title: { display: true, text: title, color: TICK },
  });
  opts.scales = { x: logAxis("Budget"), y: logAxis("Revenue") };
  opts.plugins.tooltip = {
    callbacks: {
      label: (ctx) => {
        const p = ctx.raw;
        return `${p.title} (${p.year}): budget ${fmtMoney(p.x)}, revenue ${fmtMoney(p.y)}`;
      },
    },
  };
  upsertChart("money", "chart-money", {
    type: "scatter",
    data: {
      datasets: [
        {
          data: withMoney.map((m) => ({ x: m.budget, y: m.revenue, title: m.title, year: m.year })),
          backgroundColor: RED_SOFT,
          pointRadius: 3,
        },
      ],
    },
    options: opts,
  });
}

// ---------- KPIs + table ----------
function renderKpis(movies, rated) {
  $("kpi-count").textContent = fmtInt(movies.length);
  const avg = mean(rated.map((m) => m.rating));
  $("kpi-rating").textContent = avg === null ? "–" : avg.toFixed(2);
  const med = median(movies.filter((m) => m.runtime).map((m) => m.runtime));
  $("kpi-runtime").textContent = med === null ? "–" : `${Math.round(med)} min`;
  const revenue = movies.reduce((sum, m) => sum + (m.revenue || 0), 0);
  $("kpi-revenue").textContent = revenue ? fmtMoney(revenue) : "–";
}

// Build a text node safely so movie titles can never inject HTML
function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderTable(rated) {
  const top = [...rated].sort((a, b) => b.rating - a.rating || b.votes - a.votes).slice(0, 15);
  shownIds = new Set(top.map((m) => m.id)); // remembered so the random picker can skip these
  const tbody = document.querySelector("#movie-table tbody");
  tbody.replaceChildren();
  for (const m of top) {
    const tr = document.createElement("tr");
    const posterTd = document.createElement("td");
    if (m.poster) {
      const img = document.createElement("img");
      img.src = POSTER_BASE + m.poster;
      img.alt = `Poster for ${m.title}`;
      img.loading = "lazy";
      posterTd.append(img);
    }
    tr.append(
      posterTd,
      cell(m.title),
      cell(m.year, "num"),
      cell(m.rating.toFixed(1), "num"),
      cell(fmtInt(m.votes), "num"),
      cell(m.genres.join(", ") || "Horror")
    );
    tbody.append(tr);
  }
  $("table-note").textContent = top.length ? "" : "— no movies match these filters";
}

// ---------- Random movie picker ----------
// Pool = movies matching the year / sub-genre / language filters, minus the ones already
// in the table. The "min votes" slider is ignored on purpose, so unrated movies can win.
function showPick(m) {
  const box = $("picker-result");
  box.replaceChildren();
  if (!m) {
    box.textContent = "No other movies match these filters. Try widening them.";
    return;
  }
  const details = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${m.title} (${m.year})`;
  const meta = document.createElement("div");
  meta.className = "picker-meta";
  const rating = m.votes ? `★ ${m.rating.toFixed(1)} from ${fmtInt(m.votes)} votes` : "No votes yet";
  const runtime = m.runtime ? `${m.runtime} min` : "runtime unknown";
  meta.textContent = `${rating} · ${runtime} · ${m.genres.join(", ") || "Horror"}`;
  details.append(title, meta);
  if (m.poster) {
    const img = document.createElement("img");
    img.src = POSTER_BASE + m.poster;
    img.alt = `Poster for ${m.title}`;
    box.append(img);
  }
  box.append(details);
}

function spin() {
  if (spinning) return;
  const pool = applyFilters(allMovies, readFilters()).filter((m) => !shownIds.has(m.id));
  if (!pool.length) return showPick(null);

  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const winner = pick();
  const box = $("picker-result");

  // Respect people who turn animations off in their OS settings
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return showPick(winner);

  // Flash random titles, slowing down each step, then land on the winner.
  spinning = true;
  $("spin").disabled = true;
  box.classList.add("spinning");
  const STEPS = 22;
  let step = 0;
  (function tick() {
    if (step >= STEPS) {
      box.classList.remove("spinning");
      showPick(winner);
      spinning = false;
      $("spin").disabled = false;
      return;
    }
    showPick(pick());
    step++;
    setTimeout(tick, 60 + step * step * 0.6); // 60ms at first, ~320ms at the end
  })();
}

// ---------- Main render ----------
function render() {
  const f = readFilters();
  $("min-votes-output").textContent = f.minVotes;

  const movies = applyFilters(allMovies, f);
  // "Rated" movies have enough votes for the rating to mean something
  const rated = movies.filter((m) => m.votes >= Math.max(f.minVotes, 1));

  renderKpis(movies, rated);
  renderPerYear(movies);
  renderRating(rated);
  renderGenres(movies);
  renderRuntime(movies);
  renderMoney(movies);
  renderTable(rated);
}

// ---------- Start ----------
async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allMovies = await res.json();
  } catch (err) {
    document.querySelector("main").innerHTML =
      `<p class="card">Could not load <code>${DATA_URL}</code> (${err.message}).
       Run a local server, e.g. <code>python3 -m http.server</code>, and open http://localhost:8000.</p>`;
    return;
  }
  setupFilters();
  $("spin").addEventListener("click", spin);
  render();
}

init();
