"""Crawl4AI fetch backend for dsh-crawl4ai-fetch.mjs.

Invoked by the plugin as:  python.exe crawl4ai_fetch.py "<url>"
Prints exactly one JSON object on stdout:
    {"url": ..., "statusCode": ..., "content": "<markdown>", "success": true}
    or {"error": "...", "success": false, "statusCode": 500}
Progress banners and library warnings go to stderr and are ignored by the caller.
"""
import sys, json, asyncio
from crawl4ai import AsyncWebCrawler


async def run(url):
    try:
        async with AsyncWebCrawler() as crawler:
            res = await crawler.arun(url=url)
            md = res.markdown
            if md is None:
                md = ""
            elif not isinstance(md, str):
                # Newer crawl4ai versions return a MarkdownGenerationResult
                # object instead of a plain string.
                raw = getattr(md, "raw_markdown", None)
                md = raw if isinstance(raw, str) else (getattr(res, "cleaned_html", "") or res.html or "")
            return {
                "url": getattr(res, "redirected_url", None) or url,
                "statusCode": int(getattr(res, "status_code", 200) or 200),
                "content": md,
                "success": True,
            }
    except Exception as e:
        return {"error": str(e), "success": False, "statusCode": 500}


url = sys.argv[1]
out = asyncio.run(run(url))
print(json.dumps(out))
