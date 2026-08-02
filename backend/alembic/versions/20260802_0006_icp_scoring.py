"""Add deterministic ICP profiles and explainable lead scores.

Revision ID: 20260802_0006
Revises: 20260802_0005
Create Date: 2026-08-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260802_0006"
down_revision: str | None = "20260802_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "icp_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("target_keywords", sa.JSON(), nullable=False),
        sa.Column("excluded_keywords", sa.JSON(), nullable=False),
        sa.Column("target_locations", sa.JSON(), nullable=False),
        sa.Column("require_website", sa.Boolean(), nullable=False),
        sa.Column("require_contact", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("leads") as batch_op:
        batch_op.add_column(sa.Column("icp_score", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("icp_reasons", sa.JSON(), nullable=False, server_default=sa.text("'[]'"))
        )
        batch_op.add_column(sa.Column("icp_profile_version", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("icp_scored_at", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("manual_score", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("manual_score_reason", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("manual_score_updated_at", sa.String(length=40), nullable=True))
        batch_op.create_index("ix_leads_icp_score", ["icp_score"], unique=False)
        batch_op.create_index("ix_leads_manual_score", ["manual_score"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("leads") as batch_op:
        batch_op.drop_index("ix_leads_manual_score")
        batch_op.drop_index("ix_leads_icp_score")
        batch_op.drop_column("manual_score_updated_at")
        batch_op.drop_column("manual_score_reason")
        batch_op.drop_column("manual_score")
        batch_op.drop_column("icp_scored_at")
        batch_op.drop_column("icp_profile_version")
        batch_op.drop_column("icp_reasons")
        batch_op.drop_column("icp_score")
    op.drop_table("icp_profiles")
