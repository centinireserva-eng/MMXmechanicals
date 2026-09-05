from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG, pool_size=20, max_overflow=10, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
class Base(DeclarativeBase):
    pass
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
async def ensure_schema_upgrades(conn):
    """This project has no migration framework (schema comes from
    Base.metadata.create_all at startup, which only ever CREATEs missing
    tables -- it never ALTERs an existing one). That's fine for brand-new
    tables like `geometries`, but `simulations.geometry_id` is a new column
    on a table that may already exist from before this change. Add it here,
    once, if it's missing -- additive only, never touches existing data.
    Works unchanged on both SQLite (dev) and Postgres (docker-compose)."""
    def _existing_columns(sync_conn):
        insp = inspect(sync_conn)
        if "simulations" not in insp.get_table_names():
            return None
        return {c["name"] for c in insp.get_columns("simulations")}
    columns = await conn.run_sync(_existing_columns)
    if columns is not None and "geometry_id" not in columns:
        await conn.execute(text("ALTER TABLE simulations ADD COLUMN geometry_id VARCHAR(36)"))
