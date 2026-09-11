#!/usr/bin/env python3
"""Fetch publisher headlines from Google News RSS for the Pondsight prototype.

Install requirements-news.txt, then run `refresh` for GitHub Pages or `serve`
for a local preview with an RSS endpoint. No API keys or translation service.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from functools import lru_cache
import html
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import threading
import unicodedata
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from langdetect import DetectorFactory, LangDetectException
from langdetect.detector_factory import PROFILES_DIRECTORY

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT
PAGE = SITE / "index.html"
CACHE = SITE / "news/latest.json"
TTL = timedelta(minutes=30)
LOOKBACK = timedelta(days=90)
MAX_ARTICLES = 12
TOPICS = '(aquaculture OR shrimp OR fisheries OR "water quality" OR mangrove OR salinity)'
LANGUAGE_POLICY = "english-v1"
# Build the shared, read-only model before worker threads start. Each headline
# gets its own detector with a fixed seed so results are reproducible.
LANGUAGES = DetectorFactory()
LANGUAGES.seed = 0
LANGUAGES.load_profile(PROFILES_DIRECTORY)
ALIASES = {
    "Viet Nam": "Vietnam", "Timor-Leste": "East Timor",
    "North Kalimantan": "Kalimantan Utara", "East Kalimantan": "Kalimantan Timur",
    "West Kalimantan": "Kalimantan Barat", "Central Kalimantan": "Kalimantan Tengah",
    "South Kalimantan": "Kalimantan Selatan", "East Java": "Jawa Timur",
    "West Java": "Jawa Barat", "Central Java": "Jawa Tengah",
    "North Sumatra": "Sumatera Utara", "South Sumatra": "Sumatera Selatan",
    "West Sumatra": "Sumatera Barat", "South Sulawesi": "Sulawesi Selatan",
    "Southeast Sulawesi": "Sulawesi Tenggara", "Central Sulawesi": "Sulawesi Tengah",
    "West Nusa Tenggara": "Nusa Tenggara Barat", "East Nusa Tenggara": "Nusa Tenggara Timur",
}


def utcnow():
    return datetime.now(timezone.utc)


def stamp(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_stamp(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (AttributeError, ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)


def locations():
    match = re.search(r"window\.__PONDSIGHT__ = (.*?);</script>", PAGE.read_text())
    data = json.loads(match.group(1))
    return [(p["country"], p["province"]) for p in data["provinces"]]


def names(value):
    plain = "".join(c for c in unicodedata.normalize("NFD", value)
                    if unicodedata.category(c) != "Mn").replace("Đ", "D").replace("đ", "d")
    return list(dict.fromkeys([value, ALIASES.get(value, value), plain]))


def feed_url(country, province=None):
    place = "(" + " OR ".join('"' + n.replace('"', '') + '"' for n in names(province or country)) + ")"
    # Preserve the province name in the query; don't silently expand to the country.
    query = f"{place} {TOPICS} when:90d"
    return "https://news.google.com/rss/search?" + urlencode({"q": query, "hl": "en", "gl": "US", "ceid": "US:en"})


@lru_cache(maxsize=4096)
def english_headline(title):
    try:
        detector = LANGUAGES.create()
        detector.append(title)
        ranked = detector.get_probabilities()
        return bool(ranked and ranked[0].lang == "en" and ranked[0].prob >= 0.8)
    except LangDetectException:
        return False


def clean_text(value):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", "", html.unescape(value or ""))).strip()


def safe_url(value):
    try:
        parsed = urlparse(value or "")
        return value if parsed.scheme in ("https", "http") and parsed.hostname and not parsed.username else ""
    except ValueError:
        return ""


def parse_feed(payload, now=None):
    now = now or utcnow()
    root = ET.fromstring(payload)
    if root.tag != "rss" or root.find("channel") is None:
        raise ValueError("Expected an RSS channel")
    candidates = []
    for item in root.findall("./channel/item"):
        source = item.find("source")
        publisher = clean_text(source.text if source is not None else "")
        title = clean_text(item.findtext("title"))
        if publisher and title.endswith(" - " + publisher):
            title = title[:-(len(publisher) + 3)]
        link = safe_url(item.findtext("link"))
        try:
            published = parsedate_to_datetime(item.findtext("pubDate", ""))
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError, OverflowError):
            continue
        if not title or not link or not publisher or not now - LOOKBACK <= published <= now + timedelta(minutes=5):
            continue
        if not english_headline(title):
            continue
        candidates.append({"title": title, "url": link, "source": publisher,
                           "sourceUrl": safe_url(source.get("url", "")),
                           "publishedAt": stamp(published), "language": "en"})
    candidates.sort(key=lambda a: a["publishedAt"], reverse=True)
    articles, seen_urls, seen_titles = [], set(), set()
    for article in candidates:
        normalized = re.sub(r"\W+", "", article["title"].casefold())
        if article["url"] in seen_urls or normalized in seen_titles:
            continue
        seen_urls.add(article["url"])
        seen_titles.add(normalized)
        articles.append(article)
        if len(articles) == MAX_ARTICLES:
            break
    return articles


def fetch_feed(country, province=None, previous=None, opener=urlopen, now=None):
    now = now or utcnow()
    url = feed_url(country, province)
    base = {"country": country, "province": province, "scope": "province" if province else "country",
            "queryUrl": url, "lastAttemptAt": stamp(now), "language": "en"}
    try:
        request = Request(url, headers={"User-Agent": "Pondsight-News/1.0 (RSS reader)", "Accept": "application/rss+xml, application/xml"})
        with opener(request, timeout=15) as response:
            payload = response.read(2_000_001)
        if len(payload) > 2_000_000:
            raise ValueError("RSS response exceeds the size limit")
        return {**base, "status": "ok", "fetchedAt": stamp(now), "articles": parse_feed(payload, now)}
    except Exception as error:
        # A failed check must never erase the last successful feed or change its date.
        print(f"RSS unavailable: {country}/{province or '*'} ({type(error).__name__})", flush=True)
        if previous is not None and previous.get("language") == "en":
            return {**previous, **base, "status": "stale"}
        return {**base, "status": "unavailable", "fetchedAt": None, "articles": []}


def read_cache():
    try:
        data = json.loads(CACHE.read_text())
        if isinstance(data, dict) and data.get("schemaVersion") == 1 and data.get("languagePolicy") == LANGUAGE_POLICY and isinstance(data.get("regions"), dict) and isinstance(data.get("countries"), dict):
            return data
    except (OSError, ValueError):
        pass
    return {"schemaVersion": 1, "languagePolicy": LANGUAGE_POLICY, "regions": {}, "countries": {}}


def save_cache(data):
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    data["generatedAt"] = stamp(utcnow())
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # A local script bootstrap also works when the prototype is opened as file://.
    js = "window.__PONDSIGHT_NEWS__=" + payload.replace("<", "\\u003c").replace(">", "\\u003e").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029") + ";\n"
    for path, content in [(CACHE, payload + "\n"), (CACHE.with_suffix(".js"), js)]:
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(content)
        temp.replace(path)


def refresh():
    data = read_cache()
    targets = locations()
    jobs = [("countries", c, c, None) for c in sorted({c for c, _ in targets})]
    jobs += [("regions", c + "|" + p, c, p) for c, p in targets]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetch_feed, country, province, data[group].get(key)): (group, key)
                   for group, key, country, province in jobs}
        for future in as_completed(futures):
            group, key = futures[future]
            data[group][key] = future.result()
    save_cache(data)
    feeds = [data[group][key] for group, key, _, _ in jobs]
    print(json.dumps({"feeds": len(feeds), "successful": sum(f["status"] == "ok" for f in feeds),
                      "withArticles": sum(bool(f["articles"]) for f in feeds),
                      "articles": sum(len(f["articles"]) for f in feeds)}, indent=2))
    if not any(f["status"] == "ok" for f in feeds):
        raise SystemExit("All RSS requests failed; cached feeds were preserved.")


def serve(port):
    data = read_cache()
    allowed = set(locations())
    lock = threading.Lock()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(SITE), **kwargs)

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/api/news":
                params = parse_qs(parsed.query)
                country = params.get("country", [""])[0]
                province = params.get("province", [""])[0]
                if (country, province) not in allowed:
                    self.send_error(400, "Unknown province")
                    return
                with lock:
                    for group, key, region in [("regions", country + "|" + province, province), ("countries", country, None)]:
                        previous = data[group].get(key)
                        if not previous or utcnow() - parse_stamp(previous.get("lastAttemptAt")) >= TTL:
                            data[group][key] = fetch_feed(country, region, previous)
                    save_cache(data)
                    result = {"schemaVersion": 1, "region": data["regions"][country + "|" + province],
                              "country": data["countries"][country]}
                payload = json.dumps(result, ensure_ascii=False).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            if parsed.path in ("/", "/index.html", "/index-codex-ver.html"):
                page = PAGE.read_text().replace('<meta name="pondsight-news-api" content="">',
                                               '<meta name="pondsight-news-api" content="/api/news">')
                payload = page.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            super().do_GET()

    print(f"Pondsight: http://127.0.0.1:{port} (RSS cached for 30 minutes)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["refresh", "serve"])
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.command == "refresh":
        refresh()
    else:
        serve(args.port)
