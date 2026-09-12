import asyncio
from backend.tools.web import search_web, scrape_url


def test_search_web():
    """Test DuckDuckGo search functionality"""
    results = search_web("Python programming basics", max_results=3)
    assert len(results) >= 3
    assert all(result["title"] for result in results)


def test_scrape_url():
    """Test web scraping functionality"""
    result = asyncio.run(scrape_url("https://example.com", max_chars=500))
    assert result["status"] == 200
    assert len(result["content"]) > 0


def test_scrape_error_handling():
    """Test error handling for invalid URLs"""
    result = asyncio.run(scrape_url("https://invalid-url-that-does-not-exist"))
    assert result["status"] in (404, 500, "error")
    assert "error" in result["content"].lower() or "failed" in result["content"].lower()
