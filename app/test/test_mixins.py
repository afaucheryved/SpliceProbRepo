"""
Tests for ``AlteredSequenceTrackerMixin`` and ``reconstruct_altered_sequence``.

These tests use ``fakeredis`` to avoid needing a real Redis server.
"""
import pytest
from unittest.mock import patch, MagicMock

from app.services.redis_session import set_session_data, get_session_data
from app.domain.mixins import reconstruct_altered_sequence, AlteredSequenceTrackerMixin
from app.domain.sequence_functions import AlterationFunctionsByPattern


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

    def test_bounded_delete_reconstruction(self):
        """Delete a bounded range (start + end), not just start-to-end."""
        base = "a" * 20 + "c" * 20 + "g" * 20 + "t" * 20  # 80bp
        self._set_base(base)
        # delete_by_index(start=21, end=40) — delete the c-block
        # Ground truth: a-block + g-block + t-block = 60bp
        expected = "a" * 20 + "g" * 20 + "t" * 20
        # The stored entry (as it now comes from _track_alteration post-fix)
        # contains the actual altered_sequence, not just a lossy label.
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "delete:21", "splicing": []},
                "altered_sequence": expected,
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected, (
            f"Bounded delete failed: expected {len(expected)}bp sequence, "
            f"got {len(result)}bp"
        )

    def test_non_default_length_insert_reconstruction(self):
        """Insert with length != len(pattern) — e.g. length=30."""
        base = "a" * 20 + "c" * 20 + "g" * 20 + "t" * 20  # 80bp
        self._set_base(base)
        # insert(pattern="XXXX", index=10, length=30)
        # Overwrites 30 bases starting at index 10 with "XXXX"
        expected = base[:9] + "XXXX" + base[9 + 30:]  # 54bp
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "insert:XXXX@10", "splicing": []},
                "altered_sequence": expected,
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected, (
            f"Non-default-length insert failed: expected {len(expected)}bp, "
            f"got {len(result)}bp"
        )

    def test_non_default_length_move_reconstruction(self):
        """Move with length_paste != len(pattern)."""
        base = "a" * 20 + "c" * 20 + "g" * 20 + "t" * 20  # 80bp
        self._set_base(base)
        # move(start_cc=1, end_cc=20, index_paste=40, length_paste=10)
        # Cut a-block (1-20), paste at index 40, but only overwrite 10 bases
        # After cut: c-block + g-block + t-block = 60bp
        # Paste a-block at index 40-10=30 (adjusted), overwriting 10 bases
        # Expected: c-block(20) + g-block(10) + a-block(20) + g-block(10) + t-block(20) = 70bp
        cut_seq = base[20:]  # c-block + g-block + t-block = 60bp
        # Paste at index_paste=40, adjusted for cut: 40-20=20 (0-based 19)
        # Overwrite 10 bases: cut_seq[:19] + a-block + cut_seq[19+10:]
        expected = cut_seq[:19] + base[:20] + cut_seq[29:]
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "move:1-20->@40", "splicing": []},
                "altered_sequence": expected,
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected, (
            f"Non-default-length move failed: expected {len(expected)}bp, "
            f"got {len(result)}bp"
        )

    def test_non_default_length_copy_paste_reconstruction(self):
        """Copy-paste with length_paste != len(pattern)."""
        base = "a" * 20 + "c" * 20 + "g" * 20 + "t" * 20  # 80bp
        self._set_base(base)
        # copy_past(start_cc=1, end_cc=20, index_paste=40, length_paste=10)
        # Copy a-block, paste at index 40, overwriting only 10 bases
        expected = base[:39] + base[:20] + base[49:]
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "copy_paste:1-20@40", "splicing": []},
                "altered_sequence": expected,
            }
        ])
        self._set_altered(expected)
        result = reconstruct_altered_sequence(self.SESSION_ID)
        assert result == expected, (
            f"Non-default-length copy_paste failed: expected {len(expected)}bp, "
            f"got {len(result)}bp"
        )

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

    def test_backward_compatibility_missing_altered_sequence(self):
        """Entries without 'altered_sequence' fall back to label-based reconstruction."""
        base = "atcgatcgatcgatcg"
        self._set_base(base)
        # Delete-to-end (the default case that the label encodes correctly)
        expected = base[:4]
        self._set_alterations([
            {
                "proba_simple": {},
                "mutation": {"human": "delete:5", "splicing": []},
                # No "altered_sequence" key — simulates old entries stored
                # before the fix was deployed.
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
        # Verify the altered_sequence is stored directly (fix for lossy-label bug)
        assert "altered_sequence" in entry, (
            "altered_sequence should be persisted in entries for deterministic "
            "reconstruction (fix for bounded-delete / non-default-length bugs)."
        )
        assert entry["altered_sequence"] == "atcgatcg"


# ---------------------------------------------------------------------------
# Tests for pattern-based per-match variant tracking (Task 17)
# ---------------------------------------------------------------------------

class _PatternHost(AlterationFunctionsByPattern):
    """Real AlterationFunctionsByPattern, with result_per_sequences stubbed
    (same stub shape as _StubHost) so no real SpliceAI model call is needed.
    """

    def __init__(self, sequence: str):
        self.sequence = sequence
        self.altered_sequence = sequence
        self.session_id = None
        self.there_is_change = False

    def result_per_sequences(self, using_altered_sequence: bool = False):
        seq = self.altered_sequence if using_altered_sequence else self.sequence
        return {
            "acceptor_proba": {i: {b: 0.5} for i, b in enumerate(seq)},
            "donor_proba": {i: {b: 0.5} for i, b in enumerate(seq)},
        }


class TestPatternMatchVariants:
    """`replace`/`delete_by_pattern` must track one additional entry per
    match, each reflecting only that one match changed -- without altering
    the single working `altered_sequence` the rest of the pipeline chains
    onto (the "explicit design decision" in docs/ai/progress.md Task 17).
    """

    def test_replace_two_matches_tracks_two_variants_plus_main_entry(self):
        base = "ccc" + "aaa" + "ccc" + "aaa" + "ccc"  # "aaa" at [3,6) and [9,12)
        host = _PatternHost(base)
        host.session_id = "test_replace_variants"
        set_session_data(host.session_id, "base_sequence", base)

        host.replace(old="aaa", new="ttt")

        # The working sequence keeps chaining from the all-matches result.
        expected_all_replaced = base[:3] + "ttt" + base[6:9] + "ttt" + base[12:]
        assert host.altered_sequence == expected_all_replaced

        entries = get_session_data(host.session_id, "altered_sequences")
        assert len(entries) == 3, "expected 1 main entry + 2 per-match variants"

        main_entry = entries[0]
        assert main_entry["mutation"]["human"] == "replace:aaa->ttt"
        assert main_entry["altered_sequence"] == expected_all_replaced
        assert "match_start" not in main_entry

        variant_1, variant_2 = entries[1], entries[2]
        assert variant_1["mutation"]["human"] == "replace:aaa->ttt[match 1/2]@4"
        assert variant_1["match_start"] == 3
        assert variant_1["match_end"] == 5
        # Only the first match is replaced; the second is untouched.
        assert variant_1["altered_sequence"] == base[:3] + "ttt" + base[6:]

        assert variant_2["mutation"]["human"] == "replace:aaa->ttt[match 2/2]@10"
        assert variant_2["match_start"] == 9
        assert variant_2["match_end"] == 11
        assert variant_2["altered_sequence"] == base[:9] + "ttt" + base[12:]

        # The working sequence is unaffected by having tracked the variants.
        assert host.altered_sequence == expected_all_replaced

    def test_replace_single_match_does_not_duplicate(self):
        base = "ccc" + "aaa" + "ccc"  # "aaa" occurs exactly once
        host = _PatternHost(base)
        host.session_id = "test_replace_single_match"
        set_session_data(host.session_id, "base_sequence", base)

        host.replace(old="aaa", new="ttt")

        entries = get_session_data(host.session_id, "altered_sequences")
        assert len(entries) == 1, "a single match should not produce a redundant duplicate entry"

    def test_delete_by_pattern_two_matches_tracks_two_variants(self):
        base = "ccc" + "aaa" + "ccc" + "aaa" + "ccc"  # "aaa" at [3,6) and [9,12)
        host = _PatternHost(base)
        host.session_id = "test_delete_by_pattern_variants"
        set_session_data(host.session_id, "base_sequence", base)

        host.delete_by_pattern(pattern="aaa")

        expected_all_deleted = base[:3] + base[6:9] + base[12:]
        assert host.altered_sequence == expected_all_deleted

        entries = get_session_data(host.session_id, "altered_sequences")
        assert len(entries) == 3

        variant_1, variant_2 = entries[1], entries[2]
        assert variant_1["mutation"]["human"] == "delete_by_pattern:aaa[match 1/2]@4"
        assert variant_1["match_start"] == 3
        assert variant_1["match_end"] == 5
        assert variant_1["altered_sequence"] == base[:3] + base[6:]

        assert variant_2["mutation"]["human"] == "delete_by_pattern:aaa[match 2/2]@10"
        assert variant_2["match_start"] == 9
        assert variant_2["match_end"] == 11
        assert variant_2["altered_sequence"] == base[:9] + base[12:]

        # The working sequence is unaffected by having tracked the variants.
        assert host.altered_sequence == expected_all_deleted

    def test_replace_variants_do_not_corrupt_persisted_current_altered_sequence(self):
        """Regression test: each variant's _track_alteration call persists its
        own (one-off) sequence as Redis's `current_altered_sequence` while
        `self.altered_sequence` is temporarily swapped -- a later request
        reconstructs a *fresh* InternalGeneticVariant from that Redis value
        (see `create_internal_variant`), so if it's left pointing at a variant
        instead of the real chain-forward result, every subsequent chained
        operation in the session silently corrupts from there.
        """
        base = "ccc" + "aaa" + "ccc" + "aaa" + "ccc"
        host = _PatternHost(base)
        host.session_id = "test_replace_variants_no_corruption"
        set_session_data(host.session_id, "base_sequence", base)

        host.replace(old="aaa", new="ttt")

        expected_all_replaced = base[:3] + "ttt" + base[6:9] + "ttt" + base[12:]
        # This is exactly what create_internal_variant() reads to initialise
        # a freshly-reconstructed instance's altered_sequence on the next
        # request -- it must match the real chain result, not a variant.
        assert get_session_data(host.session_id, "current_altered_sequence") == expected_all_replaced


# ---------------------------------------------------------------------------
# Tests for per-entry delta-vs-base computation (Task 20)
# ---------------------------------------------------------------------------

class TestTrackAlterationDeltaProba:
    def test_same_length_entry_gets_delta_proba(self):
        """A same-length alteration (e.g. matrix mutation) should get a
        computed `delta_proba` field shaped like `return_proba_delta()`'s
        output (per-position `value`/`delta_proportion_variation`).
        """
        host = _StubHost(sequence="atcgatcg", altered_sequence="atcgatcg")
        host.session_id = "test_delta_same_length"
        set_session_data(host.session_id, "base_sequence", "atcgatcg")

        host._track_alteration("mutate_independently")

        entry = get_session_data(host.session_id, "altered_sequences")[0]
        assert "delta_proba" in entry
        for key in ("acceptor_proba", "donor_proba"):
            assert key in entry["delta_proba"]
            assert len(entry["delta_proba"][key]) == len("atcgatcg")
            for pos_result in entry["delta_proba"][key].values():
                assert "value" in pos_result
                assert "delta_proportion_variation" in pos_result
                # _StubHost.result_per_sequences returns 0.5 for every base,
                # both for the base and the altered sequence -> delta is 0.
                assert pos_result["value"] == 0

    def test_length_changing_entry_has_no_delta_proba(self):
        """A length-changing structural edit (e.g. a delete) has no sound
        position-wise diff against the base sequence -- `delta_proba` must
        be entirely absent (not a wrong/empty value) so the frontend falls
        back to the absolute-probability chart for that entry.
        """
        host = _StubHost(sequence="atcgatcg", altered_sequence="atcg")
        host.session_id = "test_delta_length_changed"
        set_session_data(host.session_id, "base_sequence", "atcgatcg")

        host._track_alteration("delete:5")

        entry = get_session_data(host.session_id, "altered_sequences")[0]
        assert "delta_proba" not in entry
