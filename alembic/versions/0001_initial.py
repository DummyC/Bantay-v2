"""initial

Revision ID: 0001_initial
Revises: 
Create Date: 2025-10-27
"""
from alembic import op
import sqlalchemy as sa

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True, index=True),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='fisherfolk'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.sql.expression.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'devices',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('traccar_device_id', sa.Integer, nullable=True, unique=True),
        sa.Column('unique_id', sa.String(length=255), nullable=True, unique=True),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('owner_id', sa.Integer, sa.ForeignKey('users.id'), nullable=True),
        sa.Column('last_update', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        'fisherfolk',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=False, unique=True),
        sa.Column('allow_history_access', sa.Boolean(), nullable=False, server_default=sa.sql.expression.false()),
        sa.Column('medical_record', sa.Text, nullable=True),
    )

    op.create_table(
        'positions',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('devices.id'), nullable=False),
        sa.Column('latitude', sa.Float, nullable=False),
        sa.Column('longitude', sa.Float, nullable=False),
        sa.Column('speed', sa.Float, nullable=True),
        sa.Column('course', sa.Float, nullable=True),
        sa.Column('fix_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('attributes', sa.JSON, nullable=True),
    )

    op.create_table(
        'events',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('devices.id'), nullable=False),
        sa.Column('event_type', sa.String(length=255), nullable=False),
        sa.Column('server_time', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('attributes', sa.JSON, nullable=True),
    )


def downgrade():
    op.drop_table('events')
    op.drop_table('positions')
    op.drop_table('fisherfolk')
    op.drop_table('devices')
    op.drop_table('users')
