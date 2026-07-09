"""Mixin to track sequence alterations and persist them in Redis.

The mixin assumes that the host class inherits from ``GeneralServices`` (so it
has the ``result_per_seqences`` method) and that it defines the attributes
``sequence`` (original base sequence) and ``altered_sequence`` (current mutated
sequence). It also expects a ``session_id`` attribute – if missing a new UUID
will be generated and stored on the instance.

Each time a mutation method (insert, delete, move, etc.) is called, the host
class should invoke ``self._track_alteration(human_label)``. The method will:

1. Ensure a session identifier exists and store the base sequence in Redis.
2. Compute the simple probability dictionary via ``self.result_per_seqences``
   with ``using_altered_seqence=True``.
3. Derive the SpliceAI mutation label(s) by comparing the base and altered
   sequences with ``tuple_mutation``.
4. Append a JSON‑serialisable entry to the session‑scoped ``altered_sequences``
   list and update the ``current_altered_sequence`` key for subsequent calls.

.. note::

   One-hot arrays are NOT persisted in the history entries — they are only
   computed transiently, in memory, for the duration of a single model call.
   This is the key memory optimisation: the previous design stored a full
   one-hot encoding (20,000+ positions × 4 channels of floats) on *every*
   alteration, growing unbounded for the life of a session.
"""
#global import
from __future__ import annotations
import uuid
from typing import Any, List, Dict

#local import
from app.services.redis_session import get_session_data, set_session_data
from app.domain.spliceai_calculation import tuple_mutation


class AlteredSequenceTrackerMixin:
    """Mixin providing ``_track_alteration`` for mutation tracking.

    The host class must provide ``self.session_id`` (optional) and the
    attributes ``sequence`` and ``altered_sequence``. ``self.result_per_seqences``
    is used to obtain the probability dictionary.
    """

    def _ensure_session(self) -> str:
        """Create a session ID if missing and store the base sequence.

        Returns the session identifier.
        """
        if not getattr(self, "session_id", None):
            self.session_id = str(uuid.uuid4())
            # Store the original base sequence for later diff computation.
            base_seq = getattr(self, "sequence", "")
            set_session_data(self.session_id, "base_sequence", base_seq)
        return self.session_id

    def _track_alteration(self, human_label: str) -> None:
        """Persist information about the latest alteration.

        The entry stored in Redis contains:
        - ``proba_simple``: the simple probability dictionary for the altered
          sequence (acceptor/donor probabilities per position).
        - ``mutation.human``: a human‑readable description of the mutation
          (e.g. ``"insert:ATCG@12"``, ``"delete:12"``, ``"move:3-6->@10"``).
        - ``mutation.splicing``: a list of SpliceAI mutation labels in
          ``>p.<pos>.<ref>><alt>`` format (only for same-length edits; empty
          for structural edits that change sequence length).

        One-hot arrays are **not** persisted. They exist only transiently,
        in memory, for the duration of a single model call.

        Args:
            human_label: Human‑readable description of the mutation (e.g.
                ``"insert:ATCG@12"``).
        """
        session_id = self._ensure_session()

        # Retrieve the base sequence (fallback to the instance attribute).
        base_seq = get_session_data(session_id, "base_sequence")
        if base_seq is None:
            base_seq = getattr(self, "sequence", "")
            set_session_data(session_id, "base_sequence", base_seq)

        # Current altered sequence after the mutation.
        altered_seq = getattr(self, "altered_sequence", "")

        # Simple probability dictionary for the altered sequence.
        # ``result_per_seqences`` expects the flag ``using_altered_seqence``.
        proba = self.result_per_sequences(using_altered_sequence=True)

        # SpliceAI mutation label(s) – may be multiple if more than one base
        # changed between the base and altered sequences. ``tuple_mutation``
        # only supports a same-length, position-wise diff; structural edits
        # (insert/delete/move/copy-paste/pattern ops) routinely change the
        # sequence length, so fall back to an empty list instead of raising
        # and aborting the whole request in that case.
        if len(base_seq) == len(altered_seq):
            splicing_labels = list(tuple_mutation(base_seq, altered_seq))
        else:
            splicing_labels = []

        # Retrieve the existing list of tracked alterations.
        altered_list: List[Dict[str, Any]] = (
            get_session_data(session_id, "altered_sequences") or []
        )

        entry: Dict[str, Any] = {
            "proba_simple": proba,
            "mutation": {
                "human": human_label,
                "splicing": splicing_labels,
            },
        }
        altered_list.append(entry)
        set_session_data(session_id, "altered_sequences", altered_list)
        # Store the latest altered sequence for easy retrieval on the next
        # request.
        set_session_data(session_id, "current_altered_sequence", altered_seq)


def _apply_single_alteration(current: str, entry: Dict[str, Any], session_id: str) -> str:
    """Replay a single tracked alteration entry onto ``current``.

    Best-effort: for operations that cannot be deterministically reconstructed
    from their human label alone (e.g. random mutations), falls back to the
    session's stored ``current_altered_sequence`` and keeps going from there.

    Args:
        current: The sequence state before this entry was applied.
        entry: A single ``session:{id}:altered_sequences`` entry.
        session_id: The session identifier (used for the fallback lookup).

    Returns:
        The sequence state after applying this entry.
    """
    human_label = entry.get("mutation", {}).get("human", "")
    splicing_labels = entry.get("mutation", {}).get("splicing", [])

    if human_label.startswith("insert:"):
        # insert:{pattern}@{index} — replace len(pattern) bases at index
        rest = human_label[len("insert:"):]
        pattern, idx_str = rest.rsplit("@", 1)
        idx = int(idx_str)
        idx0 = idx - 1
        replace_length = len(pattern)
        current = current[:idx0] + pattern + current[idx0 + replace_length:]

    elif human_label.startswith("delete:"):
        # delete:{start} — delete from start to end of sequence
        start = int(human_label[len("delete:"):])
        start0 = start - 1
        current = current[:start0]

    elif human_label.startswith("move:"):
        # move:{start_cc}-{end_cc}->@{index_paste}
        rest = human_label[len("move:"):]
        range_part, index_part = rest.split("->@")
        start_cc, end_cc = map(int, range_part.split("-"))
        index_paste = int(index_part)
        start0 = start_cc - 1
        end0 = end_cc
        pattern = current[start0:end0]
        cut_length = end0 - start0
        current = current[:start0] + current[end0:]
        if index_paste > start_cc:
            index_paste -= cut_length
        idx0 = index_paste - 1
        replace_length = len(pattern)
        current = current[:idx0] + pattern + current[idx0 + replace_length:]

    elif human_label.startswith("copy_paste:"):
        # copy_paste:{start_cc}-{end_cc}@{index_paste}
        rest = human_label[len("copy_paste:"):]
        range_part, index_part = rest.split("@")
        start_cc, end_cc = map(int, range_part.split("-"))
        index_paste = int(index_part)
        start0 = start_cc - 1
        end0 = end_cc
        pattern = current[start0:end0]
        idx0 = index_paste - 1
        replace_length = len(pattern)
        current = current[:idx0] + pattern + current[idx0 + replace_length:]

    elif human_label.startswith("replace:"):
        # replace:{old}->{new}
        # Note: this uses simple string replacement, which won't correctly
        # handle wildcards (``_``, ``%(n)``) in the original pattern.
        # For exact matches this works correctly; for wildcard patterns
        # the reconstructed sequence may differ from the original.
        # This is a known limitation — see the docstring note above.
        rest = human_label[len("replace:"):]
        old, new = rest.split("->", 1)
        current = current.replace(old, new)

    elif human_label.startswith("delete_by_pattern:"):
        # delete_by_pattern:{pattern}
        # Same limitation as replace: wildcards are not handled.
        pattern = human_label[len("delete_by_pattern:"):]
        current = current.replace(pattern, "")

    elif human_label == "mutate_independently":
        # Random mutation — cannot reconstruct deterministically.
        # Fall back to the stored current_altered_sequence and keep
        # replaying any subsequent entries from there.
        stored = get_session_data(session_id, "current_altered_sequence")
        if stored is not None:
            current = stored

    elif splicing_labels:
        # Apply splicing labels (same-length substitutions) to the
        # current sequence.
        current_list = list(current)
        for label in splicing_labels:
            # Format: >p.<pos>.<ref>><alt> (e.g. ">p.5.a>c")
            # Strip the leading ">p." prefix, then split the remainder
            # by "." to get the position and the "ref>alt" part.
            try:
                # ">p.5.a>c" → strip ">p." → "5.a>c"
                body = label
                if body.startswith(">p."):
                    body = body[len(">p."):]
                # "5.a>c" → split by "."
                pos_str, rest = body.split(".", 1)
                pos = int(pos_str)
                # "a>c" → split by ">"
                new_base = rest.split(">")[1]
                current_list[pos - 1] = new_base
            except (IndexError, ValueError):
                pass
        current = "".join(current_list)

    return current


def reconstruct_altered_sequence(session_id: str) -> str:
    """Reconstruct the current altered sequence from the base sequence and
    the tracked alteration history stored in Redis.

    This function replays the alteration operations in order, starting from
    the base sequence, to produce the current altered sequence. It is a
    best-effort reconstruction: for operations that cannot be deterministically
    reconstructed (e.g., random mutations, pattern-based replacements with
    wildcards), the function falls back to the stored
    ``current_altered_sequence`` value.

    Args:
        session_id: The session identifier to reconstruct the sequence for.

    Returns:
        The reconstructed altered sequence string, or the base sequence if
        no alterations have been tracked.
    """
    base_seq = get_session_data(session_id, "base_sequence")
    if base_seq is None:
        return ""

    altered_list = get_session_data(session_id, "altered_sequences") or []
    if not altered_list:
        return base_seq

    current = base_seq
    for entry in altered_list:
        current = _apply_single_alteration(current, entry, session_id)
    return current


def reconstruct_altered_sequence_history(session_id: str) -> List[str]:
    """Reconstruct the altered sequence at *every* tracked alteration step.

    Like :func:`reconstruct_altered_sequence`, but returns the intermediate
    sequence state after each entry in ``session:{id}:altered_sequences``
    instead of only the final one. Used by ``GET /get/allsimpleprobas`` to
    pair each entry's cached ``proba_simple`` with the sequence it was
    computed against.

    Args:
        session_id: The session identifier to reconstruct the history for.

    Returns:
        A list the same length as the tracked alteration history, where
        element ``i`` is the altered sequence after entry ``i`` was applied.
    """
    base_seq = get_session_data(session_id, "base_sequence")
    if base_seq is None:
        return []

    altered_list = get_session_data(session_id, "altered_sequences") or []
    history: List[str] = []
    current = base_seq
    for entry in altered_list:
        current = _apply_single_alteration(current, entry, session_id)
        history.append(current)
    return history