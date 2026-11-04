# 🩸 Horror Movie Dashboard

An interactive dashboard exploring ~32K horror movies (1950–2022) from The Movie Database.
No build step, no framework: plain HTML, CSS and JavaScript, plus [Chart.js](https://www.chartjs.org/).
It's deliberately small so you can read the whole thing in one sitting.

**Data:** [TidyTuesday 2022-11-01 – Horror Movies](https://github.com/rfordatascience/tidytuesday/tree/main/data/2022/2022-11-01)
(originally pulled from [TMDB](https://www.themoviedb.org) by Tanya Shapiro).

## Run it locally

Browsers block `fetch()` on `file://` pages, so serve the folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page structure: filters, KPI cards, chart canvases, table |
| `style.css` | Look and feel (colors are CSS variables at the top) |
| `app.js` | All the logic: load data → read filters → `render()` |
| `data/horror_movies.csv` | Raw TidyTuesday download (untouched) |
| `data/movies.json` | Slimmed-down version the browser loads (generated) |
| `scripts/build_data.py` | Turns the CSV into the JSON. Edit this to expose more columns |

### How the app works

1. `init()` loads `data/movies.json`.
2. `setupFilters()` fills the dropdowns and wires up event listeners.
3. Any filter change calls `render()`, which filters the movies and then calls one small
   function per widget (`renderKpis`, `renderPerYear`, `renderRating`, ...).

To add a widget: add an element in `index.html`, write a `renderSomething(movies)` function,
and call it from `render()`.

## Re-downloading / rebuilding the data

```bash
curl -L https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2022/2022-11-01/horror_movies.csv \
  -o data/horror_movies.csv
python3 scripts/build_data.py
```

### Data notes

- Only ~1,100 movies report *both* budget and revenue. TMDB uses `0` for "unknown", and ~100 rows
  have junk placeholders such as a $1 budget, so `build_data.py` treats anything under $1,000 as unknown.
- Movies with 0 votes have a rating of 0. The **Min votes** slider controls which movies count toward
  rating averages and the top-rated table.
- Every movie is tagged "Horror", so the sub-genre filter/chart uses the *other* TMDB genre tags (Thriller, Comedy, ...).
- Poster images load straight from TMDB: `https://image.tmdb.org/t/p/w92` + `poster_path`.

## Deploy (optional, free)

GitHub → **Settings → Pages → Deploy from a branch → `main` / root**.
Your dashboard will be live at `https://<your-username>.github.io/<repo-name>/`.

## Contributing / student exercise

See **[STUDENT_EXERCISE.md](STUDENT_EXERCISE.md)** for the GitHub workflow and a menu of features to add.
