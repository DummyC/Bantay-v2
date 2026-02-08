"""align models with schema changes

Revision ID: 0002_align_models
Revises: 0001_initial
Create Date: 2026-01-26
"""
from alembic import op
import sqlalchemy as sa

revision = '0002_align_models'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade():
    # create roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('name', sa.String(length=50), nullable=False, unique=True),
        sa.Column('description', sa.String(length=255), nullable=True),
    )

    # create geofences
    op.create_table(
        'geofences',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('area', sa.Text, nullable=True),
    )

    # create logs table
    op.create_table(
        'logs',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('table_name', sa.String(length=255), nullable=False),
        sa.Column('record_id', sa.Integer, nullable=True),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('actor_user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('details', sa.JSON, nullable=True),
    )

    # devices: add new columns
    try:
        op.add_column('devices', sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=True))
    except Exception:
        pass
    try:
        op.add_column('devices', sa.Column('sim_number', sa.String(length=50), nullable=True))
    except Exception:
        pass
    try:
        op.add_column('devices', sa.Column('geofence_id', sa.Integer, sa.ForeignKey('geofences.id'), nullable=True))
    except Exception:
        pass
    try:
        op.add_column('devices', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))
    except Exception:
        pass

    # copy owner_id -> user_id if owner_id exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('devices')] if 'devices' in inspector.get_table_names() else []
    if 'owner_id' in cols and 'user_id' in cols:
        try:
            op.execute('UPDATE devices SET user_id = owner_id')
            op.drop_column('devices', 'owner_id')
        except Exception:
            pass

    # rename last_update -> updated_at if exists
    if 'last_update' in cols:
        try:
            op.alter_column('devices', 'last_update', new_column_name='updated_at')
        except Exception:
            pass

    # positions: add battery_percent and rename fix_time -> timestamp
    try:
        op.add_column('positions', sa.Column('battery_percent', sa.Float, nullable=True))
    except Exception:
        pass
    pos_cols = [c['name'] for c in inspector.get_columns('positions')] if 'positions' in inspector.get_table_names() else []
    if 'fix_time' in pos_cols and 'timestamp' not in pos_cols:
        try:
            op.add_column('positions', sa.Column('timestamp', sa.DateTime(timezone=True), nullable=True))
            op.execute('UPDATE positions SET timestamp = fix_time')
            op.drop_column('positions', 'fix_time')
        except Exception:
            pass

    # events: rename server_time -> timestamp
    evt_cols = [c['name'] for c in inspector.get_columns('events')] if 'events' in inspector.get_table_names() else []
    if 'server_time' in evt_cols and 'timestamp' not in evt_cols:
        try:
            op.add_column('events', sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()))
            op.execute('UPDATE events SET timestamp = server_time')
            op.drop_column('events', 'server_time')
        except Exception:
            pass


def downgrade():
    # best-effort downgrade: drop created tables/columns added in upgrade
    try:
        op.drop_table('logs')
    except Exception:
        pass
    try:
        op.drop_table('geofences')
    except Exception:
        pass
    try:
        op.drop_table('roles')
    except Exception:
        pass
    # devices: try to remove added columns
    for col in ('sim_number', 'geofence_id', 'created_at', 'user_id'):
        try:
            op.drop_column('devices', col)
        except Exception:
            pass
    # positions: drop battery_percent and restore fix_time if missing
    try:
        op.drop_column('positions', 'battery_percent')
    except Exception:
        pass
    try:
        op.add_column('positions', sa.Column('fix_time', sa.DateTime(timezone=True), nullable=True))
    except Exception:
        pass
