"""set reports.user_id to on delete set null

Revision ID: 0005_reports_user_set_null
Revises: 0004_devices_set_null_on_user_delete
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_reports_user_set_null"
down_revision = "0004_devices_set_null_on_user_delete"
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
    _drop_fk("reports", "users")
    if op.get_bind().dialect.has_table(op.get_bind(), "reports"):
        op.create_foreign_key(
            "reports_user_id_fkey",
            "reports",
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    _drop_fk("reports", "users")
    if op.get_bind().dialect.has_table(op.get_bind(), "reports"):
        op.create_foreign_key(
            "reports_user_id_fkey",
            "reports",
            "users",
            ["user_id"],
            ["id"],
        )
