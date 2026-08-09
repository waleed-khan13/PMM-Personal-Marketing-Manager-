"""Add the local media asset library.

Revision ID: 20260810_0010
Revises: 20260809_0009
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260810_0010"
down_revision: str | None = "20260809_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "media_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_name", sa.String(length=100), nullable=False),
        sa.Column("preview_name", sa.String(length=100), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_asset_id", sa.String(length=36), nullable=True),
        sa.Column("public_source_url", sa.String(length=2048), nullable=True),
        sa.Column("alt_text", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("preview_name"),
        sa.UniqueConstraint("storage_name"),
    )
    op.create_index("ix_media_assets_sha256", "media_assets", ["sha256"], unique=True)
    op.create_index("ix_media_assets_source", "media_assets", ["source"])
    op.create_index("ix_media_assets_source_asset_id", "media_assets", ["source_asset_id"])
    op.create_index("ix_media_assets_created_at", "media_assets", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_media_assets_created_at", table_name="media_assets")
    op.drop_index("ix_media_assets_source_asset_id", table_name="media_assets")
    op.drop_index("ix_media_assets_source", table_name="media_assets")
    op.drop_index("ix_media_assets_sha256", table_name="media_assets")
    op.drop_table("media_assets")
