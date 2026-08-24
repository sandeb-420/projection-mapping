"""Optional sidecar for TensorRT / ONNX depth on the RTX 2060.

The web app simulates a projector without this. Wire ZipDepth or DepthART-S
here when you want the ~25ms watch loop on real video.
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Lumen depth sidecar")


class Frame(BaseModel):
    width: int
    height: int
    note: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "backend": "stub"}


@app.post("/depth")
def depth(_frame: Frame) -> dict[str, str]:
    return {
        "status": "stub",
        "hint": "Load ZipDepth or DepthART-S TensorRT here. Browser sim does not need this.",
    }
