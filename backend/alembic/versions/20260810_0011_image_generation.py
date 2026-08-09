"""Add image generation provider settings and provenance.

Revision ID: 20260810_0011
Revises: 20260810_0010
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260810_0011"
down_revision: str | None = "20260810_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "image_provider_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("base_url", sa.String(length=2048), nullable=False),
        sa.Column("model", sa.String(length=180), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.String(length=40), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("media_assets", sa.Column("generation_prompt", sa.Text(), nullable=True))
    op.add_column("media_assets", sa.Column("generation_negative_prompt", sa.Text(), nullable=True))
    op.add_column("media_assets", sa.Column("generation_provider", sa.String(length=40), nullable=True))
    op.add_column("media_assets", sa.Column("generation_model", sa.String(length=180), nullable=True))
    op.add_column("media_assets", sa.Column("generation_parameters", sa.JSON(), nullable=True))
    op.create_table(
        "media_generations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("asset_id", sa.String(length=36), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("negative_prompt", sa.Text(), nullable=False),
        sa.Column("provider_kind", sa.String(length=40), nullable=False),
        sa.Column("model", sa.String(length=180), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["media_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_media_generations_asset_id", "media_generations", ["asset_id"])
    op.create_index("ix_media_generations_created_at", "media_generations", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_media_generations_created_at", table_name="media_generations")
    op.drop_index("ix_media_generations_asset_id", table_name="media_generations")
    op.drop_table("media_generations")
    op.drop_column("media_assets", "generation_parameters")
    op.drop_column("media_assets", "generation_model")
    op.drop_column("media_assets", "generation_provider")
    op.drop_column("media_assets", "generation_negative_prompt")
    op.drop_column("media_assets", "generation_prompt")
    op.drop_table("image_provider_settings")
