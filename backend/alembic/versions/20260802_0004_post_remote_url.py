"""Add the remote publication URL to posts.

Revision ID: 20260802_0004
Revises: 20260802_0003
Create Date: 2026-08-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260802_0004"
down_revision: str | None = "20260802_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("remote_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("posts", "remote_url")
