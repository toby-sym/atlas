import logging
from typing import Any, Dict, List
from bs4 import BeautifulSoup
from ddgs import DDGS
from ddgs.exceptions import DDGSException
import httpx

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


# This module provides web-related tools for the agent
def search_web(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    # Performs a web search using DuckDuckGo and returns a list of search results.
    try:
        results: List[Dict[str, str]] = []
        with DDGS() as ddgs:
            raw_results = ddgs.text(query, max_results=max_results)
            for item in raw_results:
                results.append(
                    {
                        "title": item.get("title", ""),
                        "url": item.get("href", ""),
                        "snippet": item.get("body", ""),
                    }
                )
        return results
    except DDGSException as e:
        logger.error("DuckDuckGo search failed for query '%s': %s", query, e)
        return []


# Asynchronous function to scrape a web page and extract clean text content.
async def scrape_url(url: str, max_chars: int = 4000) -> Dict[str, Any]:
    # Performs an HTTP GET request to the specified URL, parses the HTML content, and extracts clean text while removing non-content elements. Returns a dictionary with the URL, HTTP status, and extracted content (truncated to max_chars).
    try:
        async with httpx.AsyncClient(
            timeout=10.0, follow_redirects=True, headers=HEADERS
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Strip non-content tags
            for element in soup(
                ["script", "style", "nav", "header", "footer", "noscript"]
            ):
                element.decompose()

            # Extract clean text
            clean_text = soup.get_text(separator="\n", strip=True)

            return {
                "url": url,
                "status": response.status_code,
                "content": clean_text[:max_chars],
            }
    # Handle HTTP and network errors gracefully
    except (httpx.HTTPError, OSError) as e:
        logger.error("Failed to scrape URL '%s': %s", url, e)
        return {
            "url": url,
            "status": "error",
            "content": f"Failed to fetch content: {e!s}",
        }
