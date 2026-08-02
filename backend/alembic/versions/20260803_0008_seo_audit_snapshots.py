"""Add local SEO audit snapshots.

Revision ID: 20260803_0008
Revises: 20260802_0007
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260803_0008"
down_revision: str | None = "20260802_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "seo_audit_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("requested_url", sa.String(length=2048), nullable=False),
        sa.Column("final_url", sa.String(length=2048), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column("trigger", sa.String(length=40), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("overall_score", sa.Integer(), nullable=False),
        sa.Column("scores", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("checks", sa.JSON(), nullable=False),
        sa.Column("robots_respected", sa.Boolean(), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_seo_audit_snapshots_hostname", "seo_audit_snapshots", ["hostname"])
    op.create_index("ix_seo_audit_snapshots_trigger", "seo_audit_snapshots", ["trigger"])
    op.create_index("ix_seo_audit_snapshots_overall_score", "seo_audit_snapshots", ["overall_score"])
    op.create_index("ix_seo_audit_snapshots_created_at", "seo_audit_snapshots", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_seo_audit_snapshots_created_at", table_name="seo_audit_snapshots")
    op.drop_index("ix_seo_audit_snapshots_overall_score", table_name="seo_audit_snapshots")
    op.drop_index("ix_seo_audit_snapshots_trigger", table_name="seo_audit_snapshots")
    op.drop_index("ix_seo_audit_snapshots_hostname", table_name="seo_audit_snapshots")
    op.drop_table("seo_audit_snapshots")
