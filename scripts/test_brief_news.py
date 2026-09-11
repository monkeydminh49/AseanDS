"""RSS boundary cases; no network requests during tests."""
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
from xml.sax.saxutils import escape

import brief_news as news

NOW = datetime(2026, 9, 11, 8, tzinfo=timezone.utc)


def item(title="Coastal water report - Publisher", url="https://news.google.com/rss/articles/one",
         date="Fri, 11 Sep 2026 07:00:00 GMT", publisher="Publisher"):
    return (f"<item><title>{escape(title)}</title><link>{escape(url)}</link>"
            f"<pubDate>{date}</pubDate><source url='https://publisher.example'>{publisher}</source></item>")


def rss(*items):
    return ("<rss><channel>" + "".join(items) + "</channel></rss>").encode()


class NewsTests(unittest.TestCase):
    def test_deduplicate_sort_and_preserve_dates_and_publishers(self):
        payload = rss(
            item("Coastal water quality improved during the previous month - Publisher", date="Thu, 10 Sep 2026 07:00:00 GMT"),
            item("New report - Other", url="https://news.google.com/rss/articles/two", publisher="Other"),
            item("New report - Publisher", url="https://news.google.com/rss/articles/duplicate"),
        )
        articles = news.parse_feed(payload, NOW)
        self.assertEqual([a["title"] for a in articles], ["New report", "Coastal water quality improved during the previous month"])
        self.assertEqual(articles[0]["source"], "Other")
        self.assertEqual(articles[0]["publishedAt"], "2026-09-11T07:00:00Z")

    def test_reject_old_future_invalid_and_unattributed_articles(self):
        payload = rss(item(date="Tue, 01 Jan 2019 07:00:00 GMT"),
                      item(date="Sat, 12 Sep 2026 07:00:00 GMT"), item(date="not a date"),
                      item(url="javascript:alert(1)"), item(publisher=""))
        self.assertEqual(news.parse_feed(payload, NOW), [])

    def test_html_is_text_and_source_suffix_is_removed(self):
        articles = news.parse_feed(rss(item("Shrimp farmers in <b>Cà Mau</b> prepare for the rainy season - Publisher")), NOW)
        self.assertEqual(articles[0]["title"], "Shrimp farmers in Cà Mau prepare for the rainy season")
        self.assertEqual(articles[0]["language"], "en")
        self.assertEqual(articles[0]["sourceUrl"], "https://publisher.example")

    def test_an_error_page_is_not_an_empty_successful_feed(self):
        with self.assertRaises(ValueError):
            news.parse_feed(b"<html><body>Rate limited</body></html>", NOW)
        self.assertEqual(news.parse_feed(rss(), NOW), [])

    def test_failure_preserves_last_success_and_articles(self):
        previous = {"fetchedAt": "2026-09-10T10:00:00Z", "status": "ok", "language": "en", "articles": [{"title": "Saved report", "language": "en"}]}
        def offline(*args, **kwargs):
            raise TimeoutError()
        feed = news.fetch_feed("Viet Nam", "Cà Mau", previous, opener=offline, now=NOW)
        self.assertEqual(feed["status"], "stale")
        self.assertEqual(feed["articles"], previous["articles"])
        self.assertEqual(feed["fetchedAt"], previous["fetchedAt"])
        self.assertEqual(feed["lastAttemptAt"], news.stamp(NOW))
        empty = news.fetch_feed("Viet Nam", "Cà Mau", opener=offline, now=NOW)
        self.assertEqual(empty["status"], "unavailable")
        self.assertIsNone(empty["fetchedAt"])
        legacy = news.fetch_feed("Viet Nam", "Cà Mau", {"articles": [{"title": "Tin tiếng Việt"}]}, opener=offline, now=NOW)
        self.assertEqual(legacy["status"], "unavailable")
        self.assertEqual(legacy["articles"], [])

    def test_successful_empty_feed_replaces_old_matches(self):
        result = news.fetch_feed("Malaysia", "Perak", {"articles": [{"title": "Old"}]},
                                 opener=lambda *a, **kw: BytesIO(rss()), now=NOW)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["articles"], [])

    def test_urls_use_fixed_upstream_and_include_local_aliases(self):
        self.assertTrue(news.feed_url("Viet Nam", "Cà Mau").startswith("https://news.google.com/rss/search?"))
        self.assertIn("Ca+Mau", news.feed_url("Viet Nam", "Cà Mau"))
        self.assertIn("Jawa+Timur", news.feed_url("Indonesia", "East Java"))
        for country in ("Viet Nam", "Indonesia", "Thailand", "Malaysia"):
            params = parse_qs(urlparse(news.feed_url(country)).query)
            self.assertEqual(params["hl"], ["en"])
            self.assertEqual(params["ceid"], ["US:en"])
        self.assertEqual(news.safe_url("https://user:secret@example.com/article"), "")
        self.assertEqual(news.safe_url("file:///etc/passwd"), "")

    def test_cache_roundtrip_and_safe_script_bootstrap(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(news, "CACHE", Path(directory) / "latest.json"):
            data = {"schemaVersion": 1, "languagePolicy": news.LANGUAGE_POLICY, "regions": {"Viet Nam|Cà Mau": {"title": "</script><script>alert(1)</script>\u2028"}}, "countries": {}}
            news.save_cache(data)
            self.assertEqual(news.read_cache()["regions"], data["regions"])
            script = news.CACHE.with_suffix(".js").read_text()
            self.assertNotIn("</script>", script)
            self.assertIn("\\u003c", script)
            news.CACHE.write_text("[]")
            self.assertEqual(news.read_cache()["regions"], {})

    def test_reject_non_english_and_ambiguous_headlines(self):
        english = "Shrimp farmers in Cà Mau prepare for the rainy season"
        payload = rss(item(english),
                      item("Xuất khẩu thủy sản Cà Mau đạt hơn 1,3 tỷ USD", url="https://example.org/vi"),
                      item("Produksi udang meningkat di Jawa Timur", url="https://example.org/id"),
                      item("Cà Mau", url="https://example.org/short"))
        self.assertEqual([a["title"] for a in news.parse_feed(payload, NOW)], [english])

    def test_old_language_cache_is_not_reused(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(news, "CACHE", Path(directory) / "latest.json"):
            news.CACHE.write_text('{"schemaVersion":1,"regions":{"Viet Nam|Cà Mau":{}},"countries":{}}')
            self.assertEqual(news.read_cache()["regions"], {})


if __name__ == "__main__":
    unittest.main()
