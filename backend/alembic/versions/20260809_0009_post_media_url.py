"""Add revision-bound post media URLs.

Revision ID: 20260809_0009
Revises: 20260803_0008
Create Date: 2026-08-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260809_0009"
down_revision: str | None = "20260803_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("media_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("posts", "media_url")
