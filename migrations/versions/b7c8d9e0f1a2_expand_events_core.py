"""expand events core fields

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-06-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "event_type",
                sa.String(length=64),
                nullable=False,
                server_default="face_recognition",
            )
        )
        batch_op.add_column(
            sa.Column(
                "feature_type",
                sa.String(length=64),
                nullable=False,
                server_default="face_recognition",
            )
        )
        batch_op.add_column(sa.Column("object_label", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("details_json", sa.Text(), nullable=True))
        batch_op.create_index(batch_op.f("ix_events_event_type"), ["event_type"], unique=False)
        batch_op.create_index(batch_op.f("ix_events_feature_type"), ["feature_type"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_events_feature_type"))
        batch_op.drop_index(batch_op.f("ix_events_event_type"))
        batch_op.drop_column("details_json")
        batch_op.drop_column("object_label")
        batch_op.drop_column("feature_type")
        batch_op.drop_column("event_type")
