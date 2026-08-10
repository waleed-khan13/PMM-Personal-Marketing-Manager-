"""Add ComfyUI workflows and observable image generation jobs.

Revision ID: 20260810_0012
Revises: 20260810_0011
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260810_0012"
down_revision: str | None = "20260810_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("image_provider_settings", sa.Column("workflow_json", sa.Text(), nullable=True))
    op.add_column(
        "local_jobs",
        sa.Column("progress_percent", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("local_jobs", sa.Column("progress_message", sa.String(length=500), nullable=True))
    op.add_column(
        "local_jobs",
        sa.Column("cancel_requested", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("local_jobs", sa.Column("remote_ref", sa.String(length=255), nullable=True))
    op.add_column("local_jobs", sa.Column("result_ref", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("local_jobs", "result_ref")
    op.drop_column("local_jobs", "remote_ref")
    op.drop_column("local_jobs", "cancel_requested")
    op.drop_column("local_jobs", "progress_message")
    op.drop_column("local_jobs", "progress_percent")
    op.drop_column("image_provider_settings", "workflow_json")
