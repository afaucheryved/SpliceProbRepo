"""Factory for creating ``InternalGeneticVariant`` instances with session support.

The factory abstracts the creation of a fresh ``InternalGeneticVariant`` while
ensuring that a Redis session is established. If ``session_id`` is omitted a
new UUID is generated, the base sequence is stored in Redis and the identifier
is returned to the caller.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from app.domain.internal_gv_schema import InternalGeneticVariant
from app.services.redis_session import get_session_data, set_session_data


def _store_base_sequence(session_id: str, sequence: str) -> None:
    """Store the original (base) sequence for a session.

    The base sequence is stored under the key ``base_sequence``. If the key
    already exists we keep the existing value to avoid overwriting data from a
    previous request.
    """
    if get_session_data(session_id, "base_sequence") is None:
        set_session_data(session_id, "base_sequence", sequence)


def _store_current_altered(session_id: str, altered_sequence: str) -> None:
    """Store the current altered sequence for a session.

    This value is used to initialise the ``altered_sequence`` attribute of the
    ``InternalGeneticVariant`` when the variant is reconstructed on a later
    request.
    """
    set_session_data(session_id, "current_altered_sequence", altered_sequence)


def create_internal_variant(
    sequence: str,
    mutations: Optional[List[str]] = None,
    session_id: Optional[str] = None,
) -> InternalGeneticVariant:
    """Create a new ``InternalGeneticVariant`` bound to a Redis session.

    Args:
        sequence: The original (base) DNA sequence.
        mutations: Optional list of mutation strings. If ``None`` an empty list
            is used.
        session_id: Optional existing session identifier. When omitted a new
            UUID is generated.

    Returns:
        An ``InternalGeneticVariant`` instance with ``session_id`` attribute set
        and its ``altered_sequence`` initialised from the session store.
    """
    if session_id is None:
        # Generate a new session identifier.
        session_id = str(uuid.uuid4())
        # Store the base sequence for the new session.
        _store_base_sequence(session_id, sequence)
        # Initialise the current altered sequence to the base sequence.
        _store_current_altered(session_id, sequence)
    else:
        # Retrieve the base sequence from Redis; fall back to the provided one.
        base_seq = get_session_data(session_id, "base_sequence")
        if base_seq is None:
            base_seq = sequence
            _store_base_sequence(session_id, base_seq)
        sequence = base_seq
        # Ensure there is a current altered sequence entry.
        altered_seq = get_session_data(session_id, "current_altered_sequence")
        if altered_seq is None:
            _store_current_altered(session_id, sequence)

    # Create the variant instance.
    gv = InternalGeneticVariant(sequence=sequence, mutations=mutations or [])
    # Attach the session identifier.
    gv.session_id = session_id
    # Initialise the altered_sequence from the stored value.
    stored_altered = get_session_data(session_id, "current_altered_sequence")
    if stored_altered is not None:
        gv.altered_sequence = stored_altered
    else:
        gv.altered_sequence = sequence
    return gv
