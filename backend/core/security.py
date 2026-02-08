from datetime import datetime, timedelta, timezone
import logging
import os
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

from db.session import SessionLocal
from sqlalchemy.orm import Session
from models.user import User
from core.config import settings

# Create a CryptContext but be defensive: some environments may have a broken
# bcrypt installation. Respect the `PASSWORD_SCHEME` setting which can be
# 'bcrypt', 'argon2', 'plaintext' or 'auto'. In 'auto' mode we try bcrypt
# first, then argon2, then fall back to plaintext.
logger = logging.getLogger(__name__)


def _init_pwd_context():
    scheme = getattr(settings, "PASSWORD_SCHEME", "auto") or "auto"
    scheme = scheme.lower()

    # TESTING forces plaintext for simplicity in tests
    if os.getenv("TESTING"):
        return CryptContext(schemes=["plaintext"], deprecated="auto")

    def try_scheme(name):
        try:
            ctx = CryptContext(schemes=[name], deprecated="auto")
            # smoke-test with a short string to force backend finalization
            ctx.hash("__passlib_init_check__")
            logger.debug("Using password scheme: %s", name)
            return ctx
        except Exception as e:
            logger.debug("Password scheme %s unavailable: %s", name, repr(e))
            return None

    if scheme == "bcrypt":
        ctx = try_scheme("bcrypt")
        if ctx:
            return ctx
        logger.warning("bcrypt requested but unavailable; falling back to plaintext")
        return CryptContext(schemes=["plaintext"], deprecated="auto")

    if scheme == "argon2":
        ctx = try_scheme("argon2")
        if ctx:
            return ctx
        logger.warning("argon2 requested but unavailable; falling back to plaintext")
        return CryptContext(schemes=["plaintext"], deprecated="auto")

    # auto: try bcrypt, then argon2, then plaintext
    if scheme == "auto":
        ctx = try_scheme("bcrypt")
        if ctx:
            return ctx
        ctx = try_scheme("argon2")
        if ctx:
            return ctx
        logger.warning("No secure password backend available; falling back to plaintext")
        return CryptContext(schemes=["plaintext"], deprecated="auto")

    # Unknown scheme: fallback to plaintext but warn
    logger.warning("Unknown PASSWORD_SCHEME=%s; falling back to plaintext", scheme)
    return CryptContext(schemes=["plaintext"], deprecated="auto")


pwd_context = _init_pwd_context()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    # bcrypt has a maximum input size of 72 bytes; truncate by bytes to avoid ValueError.
    # We encode to UTF-8, truncate to 72 bytes, then decode back ignoring partial sequences.
    if isinstance(password, str):
        b = password.encode("utf-8")
    else:
        b = str(password).encode("utf-8")
    if len(b) > 72:
        b = b[:72]
        pw = b.decode("utf-8", errors="ignore")
    else:
        pw = b.decode("utf-8")
    return pwd_context.hash(pw)


def verify_password(plain: str, hashed: str) -> bool:
    # Apply same truncation behavior to verification to match hashing
    if isinstance(plain, str):
        b = plain.encode("utf-8")
    else:
        b = str(plain).encode("utf-8")
    if len(b) > 72:
        b = b[:72]
        plain_trunc = b.decode("utf-8", errors="ignore")
    else:
        plain_trunc = b.decode("utf-8")
    return pwd_context.verify(plain_trunc, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# Dependency: get_current_user
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "administrator":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user


def require_fisherfolk(current_user: User = Depends(get_current_user)):
    if current_user.role != "fisherfolk":
        raise HTTPException(status_code=403, detail="Fisherfolk privileges required")
    return current_user


def can_view_medical(current_user: User, target_user_id: int) -> bool:
    """Return True when the `current_user` is allowed to view the medical record
    for `target_user_id`.

    Rules:
    - Administrators and coast_guard may view any fisherfolk medical_record.
    - A user may view their own medical_record.
    """
    if current_user is None:
        return False
    # allow administrators and coast guard
    if current_user.role in ("administrator", "coast_guard"):
        return True
    # allow user to view their own record
    try:
        return int(current_user.id) == int(target_user_id)
    except Exception:
        return False


def require_coast_guard(current_user: User = Depends(get_current_user)):
    if current_user.role != "coast_guard":
        raise HTTPException(status_code=403, detail="Coast guard privileges required")
    return current_user
