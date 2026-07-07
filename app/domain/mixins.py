"""Mixin to track sequence alterations and persist them in Redis.

The mixin assumes that the host class inherits from ``GeneralServices`` (so it
has the ``result_per_seqences`` method) and that it defines the attributes
``sequence`` (original base sequence) and ``altered_sequence`` (current mutated
sequence). It also expects a ``session_id`` attribute – if missing a new UUID
will be generated and stored on the instance.

Each time a mutation method (insert, delete, move, etc.) is called, the host
class should invoke ``self._track_alteration(human_label)``. The method will:

1. Ensure a session identifier exists and store the base sequence in Redis.
2. Compute a one‑hot encoding of the current ``altered_sequence`` using the
   shared ``my_model`` instance.
3. Compute the simple probability dictionary via ``self.result_per_seqences``
   with ``using_altered_seqence=True``.
4. Derive the SpliceAI mutation label(s) by comparing the base and altered
   sequences with ``tuple_mutation``.
5. Append a JSON‑serialisable entry to the session‑scoped ``altered_sequences``
   list and update the ``current_altered_sequence`` key for subsequent calls.
"""

from __future__ import annotations

import uuid
from typing import Any, List, Dict

from app.services.redis_session import get_session_data, set_session_data
from app.domain.initialization.initalize_my_model import my_model
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

        # One‑hot encoding using the shared model.
        one_hot_arr = my_model._one_hot_encoder(altered_seq)
        one_hot_flat: List[Any] = one_hot_arr.tolist()

        # Simple probability dictionary for the altered sequence.
        # ``result_per_seqences`` expects the flag ``using_altered_seqence``.
        proba = self.result_per_sequences(using_altered_sequence=True)

        # SpliceAI mutation label(s) – may be multiple if more than one base
        # changed between the base and altered sequences.
        splicing_labels = list(tuple_mutation(base_seq, altered_seq))

        # Retrieve the existing list of tracked alterations.
        altered_list: List[Dict[str, Any]] = (
            get_session_data(session_id, "altered_sequences") or []
        )

        entry: Dict[str, Any] = {
            "one_hot": one_hot_flat,
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
