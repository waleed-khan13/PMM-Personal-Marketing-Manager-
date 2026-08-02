"""Add the local lead vault and durable deduplication identities.

Revision ID: 20260802_0005
Revises: 20260802_0004
Create Date: 2026-08-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260802_0005"
down_revision: str | None = "20260802_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "leads",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_name", sa.String(length=200), nullable=False),
        sa.Column("website", sa.String(length=2048), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=80), nullable=True),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_ref", sa.String(length=2048), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("suppressed", sa.Boolean(), nullable=False),
        sa.Column("suppression_reason", sa.String(length=500), nullable=True),
        sa.Column("suppressed_at", sa.String(length=40), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_leads_created_at"), "leads", ["created_at"], unique=False)
    op.create_index(op.f("ix_leads_source"), "leads", ["source"], unique=False)
    op.create_index(op.f("ix_leads_status"), "leads", ["status"], unique=False)
    op.create_index(op.f("ix_leads_suppressed"), "leads", ["suppressed"], unique=False)
    op.create_index(op.f("ix_leads_updated_at"), "leads", ["updated_at"], unique=False)
    op.create_table(
        "lead_identities",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("value", sa.String(length=512), nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind", "value", name="uq_lead_identity_kind_value"),
    )
    op.create_index(op.f("ix_lead_identities_lead_id"), "lead_identities", ["lead_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lead_identities_lead_id"), table_name="lead_identities")
    op.drop_table("lead_identities")
    op.drop_index(op.f("ix_leads_updated_at"), table_name="leads")
    op.drop_index(op.f("ix_leads_suppressed"), table_name="leads")
    op.drop_index(op.f("ix_leads_status"), table_name="leads")
    op.drop_index(op.f("ix_leads_source"), table_name="leads")
    op.drop_index(op.f("ix_leads_created_at"), table_name="leads")
    op.drop_table("leads")
