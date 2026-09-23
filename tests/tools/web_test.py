import asyncio

import httpx

from backend.tools import web


class FakeDDGS:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def text(self, _query, max_results):
        return [
            {
                "title": "Python",
                "href": "https://example.com/python",
                "body": "Learn Python",
            }
        ][:max_results]


def test_search_web(monkeypatch):
    monkeypatch.setattr(web, "DDGS", FakeDDGS)
    results = web.search_web("Python programming basics", max_results=3)
    assert results == [
        {
            "title": "Python",
            "url": "https://example.com/python",
            "snippet": "Learn Python",
        }
    ]


def test_search_web_rejects_empty_query():
    assert web.search_web("  ") == {
        "error": "Search query cannot be empty.",
        "results": [],
    }


def test_scrape_url(monkeypatch):
    class FakeResponse:  # pylint: disable=too-few-public-methods
        status_code = 200
        text = "<html><nav>skip</nav><main><h1>Example</h1><p>Useful text</p></main></html>"

        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, _url):
            return FakeResponse()

    monkeypatch.setattr(web.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(web.scrape_url("https://example.com", max_chars=500))
    assert result["status"] == 200
    assert "Useful text" in result["content"]
    assert "skip" not in result["content"]


def test_scrape_error_handling(monkeypatch):
    class FakeClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, _url):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(web.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(web.scrape_url("https://example.com"))
    assert result["status"] == "error"
    assert "failed" in result["content"].lower()
