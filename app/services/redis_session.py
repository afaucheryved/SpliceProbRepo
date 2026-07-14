"""Redis session management utilities.

This module provides a thin wrapper around a Redis client to store and retrieve
session‑scoped data. All keys are namespaced using the pattern
``session:{session_id}:{key}`` to avoid collisions between users.

The connection parameters are configurable via the environment variables
``REDIS_HOST``, ``REDIS_PORT`` and ``REDIS_DB``. Defaults point to a local Redis
instance on the standard port.

Values are JSON‑encoded before being stored, allowing arbitrary Python data
structures (lists, dicts, etc.) to be persisted.
"""

from __future__ import annotations

import os
import json
from typing import Any

import redis

# ---------------------------------------------------------------------------
# Try to use a real Redis client. If that fails (no server running), fall
# back to ``fakeredis`` so the application can still function without a
# dedicated Redis process during development / testing.
# ---------------------------------------------------------------------------

def _new_redis_client() -> redis.Redis:
    host = os.getenv("REDIS_HOST", "localhost")
    port = int(os.getenv("REDIS_PORT", "6379"))
    db = int(os.getenv("REDIS_DB", "0"))
    # ``decode_responses=True`` ensures we get strings back instead of bytes.
    return redis.Redis(host=host, port=port, db=db, decode_responses=True)


_REDIS_CLIENT: redis.Redis | None = None


def _get_redis_client() -> redis.Redis:
    global _REDIS_CLIENT
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    try:
        client = _new_redis_client()
        client.ping()
        _REDIS_CLIENT = client
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError):
        import fakeredis
        _REDIS_CLIENT = fakeredis.FakeStrictRedis(decode_responses=True)
    return _REDIS_CLIENT


def _namespaced_key(session_id: str, key: str) -> str:
    """Construct the Redis key used for a given session and logical key.

    Args:
        session_id: Unique identifier for the user session.
        key: Logical key (e.g. ``"base_sequence"`` or ``"altered_sequences"``).

    Returns:
        A string suitable for use with Redis commands.
    """
    return f"session:{session_id}:{key}"


def set_session_data(session_id: str, key: str, value: Any, ttl: int = 1800) -> None:
    """Store ``value`` under ``key`` for the given ``session_id``.

    The value is JSON‑encoded before storage. ``ttl`` (time‑to‑live) defaults to
    30 minutes (1800 seconds) as requested.
    """
    client = _get_redis_client()
    namespaced = _namespaced_key(session_id, key)
    client.set(namespaced, json.dumps(value), ex=ttl)


def get_session_data(session_id: str, key: str) -> Any:
    """Retrieve the JSON‑decoded value stored for ``key`` in ``session_id``.

    Returns ``None`` if the key does not exist.
    """
    client = _get_redis_client()
    namespaced = _namespaced_key(session_id, key)
    raw = client.get(namespaced)
    if raw is None:
        return None
    return json.loads(raw)
