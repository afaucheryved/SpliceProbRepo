"""
Tests for ``AlteredSequenceTrackerMixin`` and ``reconstruct_altered_sequence``.

These tests use ``fakeredis`` to avoid needing a real Redis server.
"""
import pytest
from unittest.mock import patch, MagicMock

from app.services.redis_session import set_session_data, get_session_data
from app.domain.mixins import reconstruct_altered_sequence, AlteredSequenceTrackerMixin


# ---------------------------------------------------------------------------
# Stub classes for testing the mixin independently
# ---------------------------------------------------------------------------

class _StubHost(AlteredSequenceTrackerMixin):
    """Minimal host class that provides the attributes the mixin expects."""

    def __init__(self, sequence: str = "", altered_sequence: str = ""):
        self.sequence = sequence
        self.altered_sequence = altered_sequence or sequence
        self.session_id = None

    def result_per_sequences(self, using_altered_sequence: bool = False):
        """Stub that returns a minimal probability dict."""
        seq = self.altered_sequence if using_altered_sequence else self.sequence
        return {
            "acceptor_proba": {i: {b: 0.5} for i, b in enumerate(seq)},
            "donor_proba": {i: {b: 0.5} for i, b in enumerate(seq)},
        }


# ---------------------------------------------------------------------------
# Tests for reconstruct_altered_sequence
# ---------------------------------------------------------------------------

class TestReconstructAlteredSequence:
    """Test that reconstruction from stored history matches the actual result."""

    SESSION_ID = "test_reconstruct"

    def _set_base(self, seq: str):
        set_session_data(self.SESSION_ID, "base_sequence", seq)

    def _set_altered(self, seq: str):
        set_session_data(self.SESSION_ID, "current_altered_sequence", seq)

    def _set_alterations(self, entries: list):
        set_session_data(self.SESSION_ID, "altered_sequences", entries)

    def test_no_alterations_returns_base(self):
        self._set_base("atcgatcg")
        self._set_alterations([])
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == "atcgatcg"

    def test_missing_session_returns_empty(self):
        result = reconstruct_altered_sequence("nonexistent_session")
        assert result == ""

    def test_insert_operation(self):
        base = "aaaaaaaaaaaaaaaaaaaa"
        self._set_base(base)
        # Simulate an insert: "insert:tttt@5" replaces len("tttt") = 4 bases at index 5
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "insert:tttt@5", "splicing": []},
            }
        ])
        self._set_altered(base[:4] + "tttt" + base[8:])
        result = reconstruct_altered_sequence(self.SESSION_ID)
        expected = base[:4] + "tttt" + base[8:]
        assert result == expected

    def test_delete_operation(self):
        base = "atcgatcgatcgatcg"
        self._set_base(base)
        # delete:5 — delete from index 5 to end
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "delete:5", "splicing": []},
            }
        ])
        self._set_altered(base[:4])
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == base[:4]

    def test_insert_then_delete_reconstruction(self):
        """Chain: insert then delete, verify reconstruction matches."""
        base = "aaaaaaaaaaaaaaaaaaaa"
        self._set_base(base)

        # Insert "tttt" at index 5
        after_insert = base[:4] + "tttt" + base[8:]
        # Then delete from index 3
        after_delete = after_insert[:2]

        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "insert:tttt@5", "splicing": []},
            },
            {
                "proba_simple": {},
                "mutation": {"human": "delete:3", "splicing": []},
            },
        ])
        self._set_altered(after_delete)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == after_delete

    def test_move_operation(self):
        base = "atcgatcgatcgatcg"
        self._set_base(base)
        # move:3-6->@10 — cut region 3-6 (0-based 2-5), paste at index 10
        # After cut: base[:2] + base[6:] = "at" + "cgatcgatcg"
        cut = base[:2] + base[6:]  # "atcgatcgatcg" (12 chars)
        # Paste the cut pattern (base[2:6] = "cgat") at adjusted index 6
        # (index_paste -= cut_length = 10 - 4 = 6)
        # idx0 = 5, replace_length = 4
        # cut[:5] + "cgat" + cut[9:]
        paste = cut[:5] + "cgat" + cut[9:]
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "move:3-6->@10", "splicing": []},
            }
        ])
        self._set_altered(paste)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == paste

    def test_copy_paste_operation(self):
        base = "atcgatcgatcgatcg"
        self._set_base(base)
        # copy_paste:3-6@10 — copy region 3-6, paste at index 10
        # After paste: base[:9] + "cgat" + base[13:]
        expected = base[:9] + "cgat" + base[13:]
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "copy_paste:3-6@10", "splicing": []},
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected

    def test_replace_operation_exact(self):
        base = "atcgatcgatcgatcg"
        self._set_base(base)
        # replace:atcg->NNNN — exact match
        expected = base.replace("atcg", "NNNN")
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "replace:atcg->NNNN", "splicing": []},
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected

    def test_delete_by_pattern_operation(self):
        base = "atcgatcgatcgatcg"
        self._set_base(base)
        expected = base.replace("atcg", "")
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "delete_by_pattern:atcg", "splicing": []},
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected

    def test_mutate_independently_falls_back_to_stored(self):
        """Random mutation cannot be reconstructed — falls back to stored value."""
        base = "aaaaaaaaaaaaaaaa"
        self._set_base(base)
        altered = "tacgtacgtacgtacg"  # some random result
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "mutate_independently", "splicing": []},
            }
        ])
        self._set_altered(altered)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == altered

    def test_splicing_labels_reconstruction(self):
        """Same-length substitution with splicing labels."""
        base = "aaaaaaaaaaaaaaaa"
        self._set_base(base)
        # Mutate base 5 to 'c', base 8 to 'g'
        expected = "aaaacaagaaaaaaaa"
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {
                    "human": "substitution",
                    "splicing": [">p.5.a>c", ">p.8.a>g"],
                },
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected

    def test_complex_chain_reconstruction(self):
        """Multiple operations in sequence: insert, replace, delete."""
        base = "atcgatcgatcgatcg"
        self._set_base(base)

        # Step 1: replace "atcg" -> "NNNN"
        s1 = base.replace("atcg", "NNNN")
        # Step 2: insert "XXXX" at index 3
        s2 = s1[:2] + "XXXX" + s1[6:]
        # Step 3: delete from index 5
        s3 = s2[:4]

        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "replace:atcg->NNNN", "splicing": []},
            },
            {
                "proba_simple": {},
                "mutation": {"human": "insert:XXXX@3", "splicing": []},
            },
            {
                "proba_simple": {},
                "mutation": {"human": "delete:5", "splicing": []},
            },
        ])
        self._set_altered(s3)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == s3


# ---------------------------------------------------------------------------
# Tests for _track_alteration — verify no one_hot is persisted
# ---------------------------------------------------------------------------

class TestTrackAlterationNoOneHot:
    """Verify that ``_track_alteration`` does not store ``one_hot`` in entries."""

    def test_no_one_hot_in_entry(self):
        """After _track_alteration, the stored entry should NOT contain 'one_hot'."""
        host = _StubHost(sequence="atcgatcg", altered_sequence="atcgatcg")
        # Assign a fixed session_id for deterministic test
        host.session_id = "test_no_one_hot"
        set_session_data(host.session_id, "base_sequence", "atcgatcg")

        host._track_alteration("test_alteration")

        altered_list = get_session_data(host.session_id, "altered_sequences")
        assert altered_list is not None
        assert len(altered_list) == 1
        entry = altered_list[0]
        assert "one_hot" not in entry, (
            "one_hot should NOT be persisted in altered_sequences entries. "
            "Found key 'one_hot' in entry."
        )
        # Verify the expected fields ARE present
        assert "proba_simple" in entry
        assert "mutation" in entry
        assert entry["mutation"]["human"] == "test_alteration"