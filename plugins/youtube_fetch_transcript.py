#!/usr/bin/env python3
"""Portable YouTube transcript fetcher for dsh-youtube-transcript.mjs.

Tier 1: InnerTube player API (stdlib urllib only, no third-party deps).
Tier 2: yt-dlp (if installed) as fallback for captions-off videos.

stdout: plain transcript text (joined caption lines).
stderr: marker line "TIER<n>|<lang>|<kind>" where kind is s (manual captions)
or asr (auto-generated); errors and warnings go to stderr too.
"""
import json
import re
import sys
import shutil
import subprocess
import urllib.request

PUBLIC_WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
PLAYER_URL = "https://www.youtube.com/youtubei/v1/player"


def log(msg):
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()


def http_json(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return raw


def tier1_innerTube(video_id, lang):
    body = json.dumps({
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240801.00.00",
                "hl": lang,
            }
        },
        "videoId": video_id,
        "contentCheckOk": True,
        "racyCheckOk": True,
    }).encode("utf-8")
    url = PLAYER_URL + "?key=" + PUBLIC_WEB_KEY
    raw = http_json(url, data=body, headers={"Content-Type": "application/json"})
    data = json.loads(raw)
    tracks = (data.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}
    track_list = tracks.get("captionTracks") or []
    if not track_list:
        play = (data.get("playabilityStatus") or {}).get("status") or "?"
        reason = (data.get("playabilityStatus") or {}).get("reason") or ""
        raise RuntimeError(
            "no caption tracks (playability=%s %s)" % (play, reason.strip())
        )
    chosen = None
    for t in track_list:
        if (t.get("languageCode") or "").lower() == lang.lower():
            chosen = t
            break
    if chosen is None and lang.lower() == "en":
        # Prefer English manual captions; fall back to auto-generated.
        manual = [t for t in track_list if t.get("kind") == "s"]
        chosen = (manual or track_list)[0]
    if chosen is None:
        avail = ", ".join(t.get("languageCode", "?") for t in track_list)
        raise RuntimeError("language %r not available; got: %s" % (lang, avail))
    kind = chosen.get("kind") or "s"
    base_url = chosen.get("baseUrl") or ""
    if not base_url:
        raise RuntimeError("caption track has no baseUrl")
    base = base_url + ("&fmt=json" if "fmt=" not in base_url else base_url)
    text = extract_caption_text(http_json(base))
    if not text.strip():
        raise RuntimeError("caption response contained no text segments")
    return text, ("asr" if kind == "asr" else "s")


def parse_vtt(text):
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line == "WEBVTT" or "-->" in line:
            continue
        if line.startswith(("Kind:", "Language:", "NOTE ", "STYLE")):
            continue
        lines.append(line)
    return "\n".join(lines)


def extract_caption_text(raw):
    """Turn any caption payload (protobuf-JSON, timedtext XML, or VTT)
    into plain text."""
    s = raw.lstrip()
    if s.startswith("{"):
        try:
            payload = json.loads(raw)
        except Exception:
            payload = None
        if isinstance(payload, dict):
            entries = payload.get("events") if isinstance(payload.get("events"), list) else None
        else:
            entries = payload if isinstance(payload, list) else None
        if entries:
            out = []
            for ev in entries:
                if not isinstance(ev, dict):
                    continue
                for seg in (ev.get("segs") or []):
                    txt = seg.get("utf8") or ""
                    if txt:
                        out.append(txt.strip())
            if out:
                return "\n".join(out)
    if "<text" in raw:
        texts = re.findall(r"<text[^>]*>(.*?)</text>", raw, flags=re.S)
        if texts:
            out = []
            for seg in texts:
                seg = re.sub(r"<[^>]+>", "", seg)
                seg = seg.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                seg = seg.replace("&quot;", '"').replace("&#39;", "'")
                out.append(seg.strip())
            if out:
                return "\n".join(out)
    return parse_vtt(raw)


def tier2_ytdlp(video_id, lang):
    if not shutil.which("yt-dlp"):
        raise RuntimeError("yt-dlp not found on PATH (tier 1 already failed)")
    url = "https://www.youtube.com/watch?v=" + video_id
    proc = subprocess.run(
        ["yt-dlp", "--skip-download", "--no-warnings", "-J", url],
        capture_output=True, text=True, timeout=90,
    )
    if proc.returncode != 0:
        raise RuntimeError("yt-dlp failed: " + proc.stderr[:300])
    data = json.loads(proc.stdout)
    subs = data.get("subtitles") or {}
    auto = data.get("automatic_captions") or {}
    chosen = None
    chosen_kind = None
    for pool, pool_kind in ((subs, "s"), (auto, "asr")):
        for key, variants in pool.items():
            if key.lower() == lang.lower() and variants:
                chosen = variants[0]
                chosen_kind = pool_kind
                break
        if chosen:
            break
    if chosen is None:
        keys = ", ".join(list(subs.keys()) + list(auto.keys()))
        raise RuntimeError("no %r subtitles via yt-dlp; available: %s" % (lang, keys))
    text = extract_caption_text(http_json(chosen["url"]))
    if not text.strip():
        raise RuntimeError("yt-dlp caption payload contained no text")
    return text, chosen_kind


def main():
    args = sys.argv[1:]
    video_id = None
    lang = "en"
    i = 0
    while i < len(args):
        if args[i] == "--id" and i + 1 < len(args):
            video_id = args[i + 1]; i += 2
        elif args[i] == "--lang" and i + 1 < len(args):
            lang = args[i + 1]; i += 2
        else:
            i += 1
    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        log("error: invalid or missing --id (expected 11-char YouTube video id)")
        sys.exit(2)

    text = None
    kind = None
    tier = 1
    try:
        text, kind = tier1_innerTube(video_id, lang)
    except Exception as e:
        log("warning: tier 1 failed (%s); trying yt-dlp" % e)
        try:
            text, kind = tier2_ytdlp(video_id, lang)
            tier = 2
        except Exception as e2:
            log("error: all tiers failed: %s" % str(e2)[:400])
            sys.exit(1)
    if text is None or text.strip() == "":
        log("error: empty transcript")
        sys.exit(1)
    sys.stderr.write("TIER%d|%s|%s\n" % (tier, lang, kind))
    sys.stderr.flush()
    sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
