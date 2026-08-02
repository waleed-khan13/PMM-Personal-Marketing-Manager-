"""Add reviewed outreach and lead retention controls.

Revision ID: 20260802_0007
Revises: 20260802_0006
Create Date: 2026-08-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260802_0007"
down_revision: str | None = "20260802_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("leads") as batch_op:
        batch_op.add_column(
            sa.Column("consent_status", sa.String(length=40), nullable=False, server_default="unknown")
        )
        batch_op.add_column(sa.Column("legal_basis", sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column("legal_basis_note", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("retention_until", sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column("compliance_reviewed_at", sa.String(length=40), nullable=True))
        batch_op.create_index("ix_leads_consent_status", ["consent_status"], unique=False)
        batch_op.create_index("ix_leads_legal_basis", ["legal_basis"], unique=False)
        batch_op.create_index("ix_leads_retention_until", ["retention_until"], unique=False)

    op.create_table(
        "outreach_drafts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("lead_id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=40), nullable=False),
        sa.Column("objective", sa.String(length=500), nullable=False),
        sa.Column("tone", sa.String(length=160), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("rationale", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("provider_kind", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=180), nullable=False),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.Column("approved_at", sa.String(length=40), nullable=True),
        sa.Column("exported_at", sa.String(length=40), nullable=True),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_outreach_drafts_lead_id", "outreach_drafts", ["lead_id"])
    op.create_index("ix_outreach_drafts_status", "outreach_drafts", ["status"])
    op.create_index("ix_outreach_drafts_created_at", "outreach_drafts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_outreach_drafts_created_at", table_name="outreach_drafts")
    op.drop_index("ix_outreach_drafts_status", table_name="outreach_drafts")
    op.drop_index("ix_outreach_drafts_lead_id", table_name="outreach_drafts")
    op.drop_table("outreach_drafts")
    with op.batch_alter_table("leads") as batch_op:
        batch_op.drop_index("ix_leads_retention_until")
        batch_op.drop_index("ix_leads_legal_basis")
        batch_op.drop_index("ix_leads_consent_status")
        batch_op.drop_column("compliance_reviewed_at")
        batch_op.drop_column("retention_until")
        batch_op.drop_column("legal_basis_note")
        batch_op.drop_column("legal_basis")
        batch_op.drop_column("consent_status")
