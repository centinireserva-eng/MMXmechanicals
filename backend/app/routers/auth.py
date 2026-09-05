from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app.models.user import User, PlanType
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.core.tenant import get_current_user
router = APIRouter()
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company: str | None = None
class LoginRequest(BaseModel):
    email: EmailStr
    password: str
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db=Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none(): raise HTTPException(400, "Email ja cadastrado")
    user = User(email=req.email, full_name=req.full_name, company=req.company, hashed_password=hash_password(req.password), plan=PlanType.FREE)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id, {"email": user.email, "plan": user.plan.value}), refresh_token=create_refresh_token(user.id))
@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db=Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password): raise HTTPException(401, "Email ou senha invalidos")
    if not user.is_active: raise HTTPException(403, "Conta desativada")
    return TokenResponse(access_token=create_access_token(user.id, {"email": user.email, "plan": user.plan.value}), refresh_token=create_refresh_token(user.id))
@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "company": user.company, "plan": user.plan.value, "simulations_used": user.simulations_used, "sim_limit": user.sim_limit, "grid_limit": user.grid_limit}
@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: dict, db=Depends(get_db)):
    refresh = body.get("token") or body.get("refresh_token")
    if not refresh: raise HTTPException(400, "Refresh token ausente")
    payload = decode_token(refresh)
    if not payload or payload.get("type") != "refresh": raise HTTPException(401, "Refresh token invalido")
    result = await db.execute(select(User).where(User.id == payload.get("sub")))
    user = result.scalar_one_or_none()
    if not user or not user.is_active: raise HTTPException(401, "Usuario nao encontrado")
    return TokenResponse(access_token=create_access_token(user.id, {"email": user.email, "plan": user.plan.value}), refresh_token=create_refresh_token(user.id))
