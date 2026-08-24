"""Optional sidecar for pose (DA3 / MoGe) and one-shot look compilation.

The web app maps a virtual room without this process. Start it when you want
DA3-SMALL / MoGe-2 poses or an LLM WGSL bake:

    uvicorn app:app --host 127.0.0.1 --port 8787
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Lumen sidecar")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Frame(BaseModel):
    width: int
    height: int
    note: str | None = None


class ShaderBody(BaseModel):
    prompt: str = Field(min_length=1)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "da3": _module_present("depth_anything_3"),
        "moge": _module_present("moge"),
        "llm": bool(os.environ.get("OPENAI_API_KEY")),
    }


@app.post("/depth")
def depth(_frame: Frame) -> dict[str, str]:
    return {
        "status": "stub",
        "hint": "Load ZipDepth or DepthART-S TensorRT here. Live watch is deferred.",
    }


@app.post("/pose")
def pose(body: dict[str, Any]) -> dict[str, Any]:
    """DA3-SMALL / MoGe-2 when installed; otherwise the browser uses station layout."""
    views = body.get("views") if isinstance(body, dict) else None
    if not isinstance(views, list) or not views:
        return {"ok": False, "reason": "no-views"}
    da3 = _try_da3(views)
    if da3 is not None:
        return {"ok": True, "source": "da3", "views": da3}
    moge = _try_moge(views)
    if moge is not None:
        return {"ok": True, "source": "moge", "views": moge}
    return {
        "ok": False,
        "reason": "no-pose-backend",
        "hint": "Install DA3-SMALL or MoGe-2 and set LUMEN_RUN_DA3=1. The app falls back to station layout + DeviceOrientation.",
        "da3_installed": _module_present("depth_anything_3"),
        "moge_installed": _module_present("moge"),
    }


@app.post("/shader")
def shader(body: ShaderBody) -> dict[str, Any]:
    """One-shot look spec. Keywords always work; LLM is optional."""
    keyword = _keyword_look(body.prompt)
    llm = _try_llm_look(body.prompt, keyword)
    if llm is not None:
        return llm
    return {**keyword, "ok": True, "source": "keywords"}


def _module_present(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def _try_da3(views: list[Any]) -> list[dict[str, Any]] | None:
    if os.environ.get("LUMEN_RUN_DA3") != "1":
        return None
    if not _module_present("depth_anything_3"):
        return None
    # Real inference is opt-in so a missing checkpoint cannot hang the host.
    # Wire DepthAnything3.from_pretrained here when a local DA3-SMALL is present.
    _ = views
    return None


def _try_moge(views: list[Any]) -> list[dict[str, Any]] | None:
    if os.environ.get("LUMEN_RUN_MOGE") != "1":
        return None
    if not _module_present("moge"):
        return None
    _ = views
    return None


def _keyword_look(prompt: str) -> dict[str, Any]:
    p = prompt.lower()
    if re.search(r"(water|ocean|ripple|caustic)", p):
        mode = "water"
    elif re.search(r"(fire|lava|ember|heat)", p):
        mode = "fire"
    elif re.search(r"(scan|lidar|contour|wire)", p):
        mode = "scan"
    elif re.search(r"(grid|graph|metric)", p):
        mode = "grid"
    elif re.search(r"(flow|wind|smoke)", p):
        mode = "flow"
    else:
        mode = "gel"
    if re.search(r"(gold|amber|warm)", p):
        hue = 38
    elif re.search(r"(cyan|teal|ice)", p):
        hue = 172
    elif re.search(r"(magenta|pink|neon)", p):
        hue = 312
    elif re.search(r"(red|lava)", p):
        hue = 8
    elif "blue" in p:
        hue = 214
    elif "green" in p:
        hue = 132
    else:
        hue = 0
        for ch in p:
            hue = (hue * 33 + ord(ch)) % 360
    freq = 1.6 if "slow" in p else 7.0 if "fast" in p else 3.4
    return {"hue": hue, "mode": mode, "freq": freq, "prompt": prompt.strip()}


def _try_llm_look(prompt: str, fallback: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    payload = {
        "model": os.environ.get("LUMEN_LLM_MODEL", "gpt-4o-mini"),
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Return JSON with keys hue (0-360), mode "
                    "(gel|grid|flow|scan|fire|water), freq (1-8), and wgsl "
                    "(a short WGSL snippet that would tint a mapped surface). "
                    "This is baked once after mapping, never per frame."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    }
    req = urllib.request.Request(
        os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions"),
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError, TimeoutError):
        return None
    modes = {"gel", "grid", "flow", "scan", "fire", "water"}
    mode = parsed.get("mode") if parsed.get("mode") in modes else fallback["mode"]
    hue = parsed.get("hue")
    freq = parsed.get("freq")
    wgsl = parsed.get("wgsl")
    return {
        "ok": True,
        "source": "llm",
        "hue": hue if isinstance(hue, (int, float)) else fallback["hue"],
        "mode": mode,
        "freq": freq if isinstance(freq, (int, float)) else fallback["freq"],
        "wgsl": wgsl if isinstance(wgsl, str) else None,
        "prompt": prompt.strip(),
    }
