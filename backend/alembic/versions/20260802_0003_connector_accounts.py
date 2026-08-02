"""Add encrypted connector accounts.

Revision ID: 20260802_0003
Revises: 20260801_0002
Create Date: 2026-08-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260802_0003"
down_revision: str | None = "20260801_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "connector_accounts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("adapter_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("encrypted_secrets", sa.Text(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("remote_account_id", sa.String(length=255), nullable=True),
        sa.Column("last_verified_at", sa.String(length=40), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("adapter_id", "name", name="uq_connector_adapter_name"),
    )
    op.create_index("ix_connector_accounts_adapter_id", "connector_accounts", ["adapter_id"])
    op.create_index("ix_connector_accounts_status", "connector_accounts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_connector_accounts_status", table_name="connector_accounts")
    op.drop_index("ix_connector_accounts_adapter_id", table_name="connector_accounts")
    op.drop_table("connector_accounts")
