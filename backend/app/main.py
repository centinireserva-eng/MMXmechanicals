from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import uvicorn, os
from app.config import settings
from app.database import engine, Base, ensure_schema_upgrades
import app.models  # noqa: F401 -- registers every model on Base.metadata
from app.routers import auth, projects, simulations, files, geometries
from app.services.i18n.translator import TranslationService
@asynccontextmanager
async def lifespan(app):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.RESULTS_DIR, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await ensure_schema_upgrades(conn)
    app.state.i18n = TranslationService(settings.DEFAULT_LANG)
    yield
    await engine.dispose()
app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION, lifespan=lifespan, docs_url="/api/docs", redoc_url="/api/redoc")
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/results", StaticFiles(directory=settings.RESULTS_DIR), name="results")
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(simulations.router, prefix="/api/simulations", tags=["simulations"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(geometries.router, prefix="/api/geometries", tags=["geometries"])
@app.get("/api/health")
async def health():
    return {"status": "online", "app": settings.APP_NAME, "version": settings.APP_VERSION, "gpu": settings.USE_GPU}
@app.get("/api/i18n/{lang}")
async def get_translations(lang, request):
    return request.app.state.i18n.get_all_translations(lang)
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
