"""Turn the raw TidyTuesday CSV into a slimmer JSON file the dashboard loads.

Run from the repo root:   python3 scripts/build_data.py

Reads:  data/horror_movies.csv   (raw download, see README for the source)
Writes: data/movies.json         (what the browser actually loads)

We drop big text columns (overview, tagline) to keep the file small.
If you want a feature that needs them, add them to KEEP below and re-run!
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "horror_movies.csv"
OUT = ROOT / "data" / "movies.json"


def to_num(value, cast=float):
    """Empty / 'NA' -> None, otherwise cast to a number."""
    if value in ("", "NA"):
        return None
    return cast(value)


def clean_money(value, minimum=1000):
    n = int(value)
    return n if n >= minimum else None


movies = []
with open(SRC, encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f):
        if not row["release_date"]:
            continue
        movies.append(
            {
                "id": int(row["id"]),
                "title": row["title"],
                "year": int(row["release_date"][:4]),
                "language": row["original_language"],
                "popularity": to_num(row["popularity"]),
                "votes": int(row["vote_count"]),
                "rating": float(row["vote_average"]),
                # 0 in the raw data means "unknown", and ~100 rows have junk
                # placeholders like a $1 budget, so treat anything under
                # $1,000 as unknown too.
                "budget": clean_money(row["budget"]),
                "revenue": clean_money(row["revenue"]),
                "runtime": to_num(row["runtime"], int) or None,
                # every row is tagged "Horror", so keep the *other* genres
                "genres": [g.strip() for g in row["genre_names"].split(",") if g.strip() and g.strip() != "Horror"],
                "poster": row["poster_path"] or None,
                "collection": row["collection_name"] or None,
                "status": row["status"],
            }
        )

OUT.write_text(json.dumps(movies, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(f"Wrote {len(movies):,} movies -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")
