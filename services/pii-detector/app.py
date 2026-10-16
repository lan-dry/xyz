"""Local detector for names, addresses and dates of birth.

Runs next to stoa-api so message text never leaves the bank's network.
Message text is never logged.
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from gliner2 import GLiNER2
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("PII_MODEL", "fastino/gliner2-privacy-filter-PII-multi")
DEFAULT_LABELS = ["person", "address", "date_of_birth"]
MAX_CHARS = 200_000
WINDOW = 1200
OVERLAP = 200

state: dict[str, Any] = {}


def pick_device() -> str:
    wanted = os.environ.get("PII_DEVICE", "auto")
    if wanted != "auto":
        return wanted
    return "cuda" if torch.cuda.is_available() else "cpu"


@asynccontextmanager
async def lifespan(_: FastAPI):
    device = pick_device()
    model = GLiNER2.from_pretrained(MODEL_ID)
    model.to(device)
    model.eval()
    state.update(model=model, device=device)
    yield
    state.clear()


app = FastAPI(title="pii-detector", lifespan=lifespan)


class DetectRequest(BaseModel):
    text: str = Field(max_length=MAX_CHARS)
    labels: list[str] = Field(default_factory=lambda: list(DEFAULT_LABELS))
    threshold: float = Field(default=0.3, ge=0.0, le=1.0)


class Entity(BaseModel):
    label: str
    start: int
    end: int
    score: float


class DetectResponse(BaseModel):
    entities: list[Entity]
    model: str
    elapsed_ms: int


def windows(text: str) -> list[tuple[int, str]]:
    """Overlapping slices cut at whitespace, so no entity is split by a window edge."""
    if len(text) <= WINDOW:
        return [(0, text)]
    out: list[tuple[int, str]] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + WINDOW)
        if end < len(text):
            cut = text.rfind(" ", start + WINDOW // 2, end)
            end = cut if cut > start else end
        out.append((start, text[start:end]))
        if end >= len(text):
            break
        start = max(end - OVERLAP, start + 1)
    return out


def spans_from_result(result: dict[str, Any], chunk: str, offset: int) -> list[Entity]:
    found: list[Entity] = []
    for label, items in (result.get("entities") or {}).items():
        search_from: dict[str, int] = {}
        for item in items:
            if isinstance(item, str):
                item = {"text": item}
            value = item.get("text") or ""
            score = float(item.get("confidence", item.get("score", 1.0)))
            start = item.get("start")
            end = item.get("end")
            if start is None or end is None:
                pos = chunk.find(value, search_from.get(value, 0))
                if pos < 0 or not value:
                    continue
                start, end = pos, pos + len(value)
                search_from[value] = end
            found.append(
                Entity(label=label, start=offset + int(start), end=offset + int(end), score=score)
            )
    return found


def dedupe(entities: list[Entity]) -> list[Entity]:
    best: dict[tuple[str, int, int], Entity] = {}
    for e in entities:
        key = (e.label, e.start, e.end)
        if key not in best or e.score > best[key].score:
            best[key] = e
    return sorted(best.values(), key=lambda e: (e.start, e.end))


@app.get("/health")
def health() -> dict[str, str]:
    if "model" not in state:
        raise HTTPException(status_code=503, detail="loading")
    return {"status": "ok", "model": MODEL_ID, "device": state["device"]}


@app.post("/detect", response_model=DetectResponse)
def detect(body: DetectRequest) -> DetectResponse:
    model = state.get("model")
    if model is None:
        raise HTTPException(status_code=503, detail="loading")
    started = time.perf_counter()
    entities: list[Entity] = []
    if body.text.strip():
        with torch.inference_mode():
            for offset, chunk in windows(body.text):
                result = model.extract_entities(
                    chunk,
                    body.labels,
                    threshold=body.threshold,
                    include_confidence=True,
                    include_spans=True,
                )
                entities.extend(spans_from_result(result, chunk, offset))
    return DetectResponse(
        entities=dedupe(entities),
        model=MODEL_ID,
        elapsed_ms=int((time.perf_counter() - started) * 1000),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("PII_HOST", "127.0.0.1"),
        port=int(os.environ.get("PII_PORT", "8095")),
        access_log=False,
    )
