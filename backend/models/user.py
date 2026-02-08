from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from db.base import Base
from sqlalchemy import event, text


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    role_obj = relationship("Role")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def role_name(self):
        return self.role_obj.name if self.role_obj else None

    @property
    def role(self):
        # backward-compatible attribute used in code/tests: return role name
        # return transient override if set during construction
        if hasattr(self, "_role_name_override") and self._role_name_override:
            return self._role_name_override
        return self.role_name

    @role.setter
    def role(self, value):
        # allow setting role by name during construction or updates; store a transient
        # override which will be resolved to a Role when persisted via the application
        if isinstance(value, str):
            self._role_name_override = value
        else:
            # allow assigning Role objects directly
            self.role_obj = value


def _ensure_role_id(mapper, connection, target):
    """ORM event: if a transient role name was set on the instance (via `role=`),
    ensure a corresponding row exists in `roles` and set `role_id` to that id.
    This allows tests and code to continue assigning `role="administrator"` without
    needing to explicitly create Role rows first.
    """
    rn = getattr(target, "_role_name_override", None)
    if not rn:
        return
    # find role by name
    res = connection.execute(text("SELECT id FROM roles WHERE name = :name"), {"name": rn}).fetchone()
    if res:
        target.role_id = res[0]
        return
    # insert role and fetch id
    connection.execute(text("INSERT INTO roles (name, description) VALUES (:name, :desc)"), {"name": rn, "desc": rn})
    res = connection.execute(text("SELECT id FROM roles WHERE name = :name"), {"name": rn}).fetchone()
    if res:
        target.role_id = res[0]


event.listen(User, "before_insert", _ensure_role_id)
event.listen(User, "before_update", _ensure_role_id)
