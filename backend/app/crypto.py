from __future__ import annotations

import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings


def _load_master_key() -> bytes:
    path = get_settings().master_key_path
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        key = base64.b64decode(path.read_text(encoding="utf-8").strip(), validate=True)
        if len(key) != 32:
            raise ValueError("Invalid local master key length.")
        return key
    except FileNotFoundError:
        key = os.urandom(32)
        encoded = base64.b64encode(key)
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as key_file:
                key_file.write(encoded)
        except FileExistsError:
            return _load_master_key()
        return key


def encrypt_secret(secret: str) -> str:
    iv = os.urandom(12)
    encrypted = AESGCM(_load_master_key()).encrypt(iv, secret.encode("utf-8"), None)
    ciphertext, tag = encrypted[:-16], encrypted[-16:]
    return json.dumps(
        {
            "iv": base64.b64encode(iv).decode("ascii"),
            "tag": base64.b64encode(tag).decode("ascii"),
            "value": base64.b64encode(ciphertext).decode("ascii"),
        },
        separators=(",", ":"),
    )


def decrypt_secret(value: str | None) -> str:
    if not value:
        return ""
    try:
        payload = json.loads(value)
        iv = base64.b64decode(payload["iv"], validate=True)
        tag = base64.b64decode(payload["tag"], validate=True)
        ciphertext = base64.b64decode(payload["value"], validate=True)
        return AESGCM(_load_master_key()).decrypt(iv, ciphertext + tag, None).decode("utf-8")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError("A saved local secret could not be decrypted.") from error


def serialize_legacy_secret(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    required = {"iv", "tag", "value"}
    if not required.issubset(value):
        return None
    return json.dumps({key: str(value[key]) for key in ("iv", "tag", "value")}, separators=(",", ":"))
