"""add cascade for fisherfolk user fk and soften logs fk

Revision ID: 0003_fisherfolk_cascade
Revises: 0002_align_models
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_fisherfolk_cascade"
down_revision = "0002_align_models"
branch_labels = None
depends_on = None


def _drop_fk(table: str, target: str):
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if table not in insp.get_table_names():
        return []
    dropped = []
    for fk in insp.get_foreign_keys(table):
        if fk.get("referred_table") == target:
            op.drop_constraint(fk["name"], table, type_="foreignkey")
            dropped.append(fk)
    return dropped


def upgrade():
    # fisherfolk.user_id -> users.id should cascade on delete
    _drop_fk("fisherfolk", "users")
    if op.get_bind().dialect.has_table(op.get_bind(), "fisherfolk"):
        op.create_foreign_key(
            "fisherfolk_user_id_fkey",
            "fisherfolk",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # logs.actor_user_id -> users.id should set null so history survives deletes
    _drop_fk("logs", "users")
    if op.get_bind().dialect.has_table(op.get_bind(), "logs"):
        op.create_foreign_key(
            "logs_actor_user_id_fkey",
            "logs",
            "users",
            ["actor_user_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    # revert to FKs without ondelete behavior
    _drop_fk("fisherfolk", "users")
    if op.get_bind().dialect.has_table(op.get_bind(), "fisherfolk"):
        op.create_foreign_key(
            "fisherfolk_user_id_fkey",
            "fisherfolk",
            "users",
            ["user_id"],
            ["id"],
        )

    _drop_fk("logs", "users")
    if op.get_bind().dialect.has_table(op.get_bind(), "logs"):
        op.create_foreign_key(
            "logs_actor_user_id_fkey",
            "logs",
            "users",
            ["actor_user_id"],
            ["id"],
        )
