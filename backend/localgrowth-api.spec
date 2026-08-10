# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules


hiddenimports = (
    collect_submodules("sqlalchemy.dialects.sqlite")
    + collect_submodules("uvicorn.protocols")
    + collect_submodules("uvicorn.lifespan")
)

analysis = Analysis(
    ["app/launcher.py"],
    pathex=["."],
    binaries=[],
    datas=[("alembic.ini", "."), ("alembic", "alembic")],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest"],
    noarchive=False,
    optimize=1,
)
pyz = PYZ(analysis.pure)

executable = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="localgrowth-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
