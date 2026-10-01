from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# backend/app/main.py → up three levels is the repo root → frontend/
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

app = FastAPI(title="Hangout API")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Must stay last: anything that isn't /api/... is served from frontend/.
# html=True serves index.html for "/" and your 404.html for missing pages.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")