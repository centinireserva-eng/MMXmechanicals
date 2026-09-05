from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.core.tenant import get_current_user
from app.models.user import User
from app.models.project import Project
import uuid
router = APIRouter()
class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
@router.get("/")
async def list_projects(user=Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(Project).where(Project.user_id == user.id))
    return [{"id": p.id, "name": p.name, "description": p.description} for p in result.scalars().all()]
@router.post("/")
async def create_project(req: ProjectCreate, user=Depends(get_current_user), db=Depends(get_db)):
    project = Project(id=str(uuid.uuid4()), name=req.name, description=req.description, user_id=user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {"id": project.id, "name": project.name}
@router.get("/{project_id}")
async def get_project(project_id, user=Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user.id))
    project = result.scalar_one_or_none()
    if not project: raise HTTPException(404, "Projeto nao encontrado")
    return {"id": project.id, "name": project.name, "description": project.description}
