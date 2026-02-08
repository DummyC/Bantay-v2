from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from core.security import verify_password, hash_password, create_access_token, get_current_user, get_db, decode_token
from fastapi.security import OAuth2PasswordBearer
from schemas.auth import LoginIn, Token, RegisterIn
from schemas.user import UserOut, UserCreate
from models.user import User
from core.config import settings

router = APIRouter()

# Optional OAuth2 scheme for checking an optional token without auto error
optional_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user_optional(token: str = Depends(optional_oauth2), db: Session = Depends(get_db)):
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            return None
        user = db.query(User).filter(User.id == int(user_id)).first()
        return user
    except Exception:
        return None


@router.post("/login", response_model=Token)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id), "role": user.role}, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": token, "token_type": "bearer"}


@router.post("/register", response_model=UserOut)
def register(data: RegisterIn, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user_optional)):
    """Register a new user.

    Registration rules:
    - If an administrator already exists in the database, only an authenticated administrator
      may create new users.
    - If no administrator exists yet, allow unauthenticated registration (to create the first admin).
    """
    # check if an administrator exists
    from models.role import Role

    admin_role = db.query(Role).filter(Role.name == "administrator").first()
    admin_exists = False
    if admin_role:
        admin_user = db.query(User).filter(User.role_id == admin_role.id).first()
        admin_exists = admin_user is not None

    if admin_exists:
        # require current_user to be an administrator
        if current_user is None or current_user.role != "administrator":
            raise HTTPException(status_code=403, detail="Administrator privileges required to register users")

    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # resolve role name to role_id (create role if missing)
    role_obj = db.query(Role).filter(Role.name == data.role).first()
    if not role_obj:
        role_obj = Role(name=data.role, description=f"Role {data.role}")
        db.add(role_obj)
        db.flush()
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password), role_id=role_obj.id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout():
    # frontend should discard token; server can implement blacklist if desired
    return {"ok": True}
