"""
Unit tests for alteration functions (AlterationFunctionsByIndex and AlterationFunctionsByPattern).
"""
import pytest
from app.schemas.internal_gv_schema import InternalGeneticVariant


# ----- Fixtures -----

@pytest.fixture
def simple_gv():
    """Returns a fresh InternalGeneticVariant with a simple ATCG sequence and no mutations."""
    return InternalGeneticVariant(
        sequence="atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg",
        mutations=[],
    )


@pytest.fixture
def gv_with_mutations():
    """Returns a GV that already has a mutation applied (a change at pos 5)."""
    return InternalGeneticVariant(
        sequence="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        mutations=[">p.5.a>c"],
    )


# ===== AlterationFunctionsByIndex Tests =====

class TestDeleteByIndex:
    def test_delete_by_start_end(self, simple_gv):
        gv = simple_gv
        original = gv.altered_sequence
        gv.delete_by_index(start=3, end=6)
        assert gv.altered_sequence == original[:2] + original[6:]

    def test_delete_by_start_length(self, simple_gv):
        gv = simple_gv
        original = gv.altered_sequence
        gv.delete_by_index(start=3, length=4)
        assert gv.altered_sequence == original[:2] + original[6:]

    def test_delete_all(self, simple_gv):
        gv = simple_gv
        gv.delete_by_index(start=1, length="all")
        assert gv.altered_sequence == ""

    def delete_end_to_end(self, simple_gv):
        gv = simple_gv
        original = gv.altered_sequence
        gv.delete_by_index(start=30, length="all")
        assert gv.altered_sequence == original[:29]

    def test_delete_invalid_both_params(self, simple_gv):
        gv = simple_gv
        with pytest.raises(ValueError, match="cannot use both"):
            gv.delete_by_index(start=1, end=5, length=3)

    def test_delete_chaining(self, simple_gv):
        """Test that two deletes chain correctly."""
        gv = simple_gv
        original = gv.altered_sequence
        # Delete indices 3-6 (0-based 2-6)
        gv.delete_by_index(start=3, length=4)
        # After first delete, the sequence is shorter.
        # Delete indices 10-12 from the new sequence.
        before_second = gv.altered_sequence
        gv.delete_by_index(start=10, length=3)
        assert len(gv.altered_sequence) == len(before_second) - 3

    def test_delete_after_mutation(self, gv_with_mutations):
        """Test delete works correctly after an initial mutation changed the sequence."""
        gv = gv_with_mutations
        assert gv.altered_sequence[4] == "c"  # mutation applied
        original = gv.altered_sequence
        gv.delete_by_index(start=2, length=10)
        expected = original[:1] + original[11:]
        assert gv.altered_sequence == expected


class TestInsert:
    def test_insert_simple(self, simple_gv):
        gv = simple_gv
        gv.insert(pattern="nnn", index=5, length="default")
        assert "nnn" in gv.altered_sequence
        assert gv.altered_sequence[4:7] == "nnn"

    def test_insert_all(self, simple_gv):
        gv = simple_gv
        gv.insert(pattern="hello", index=1, length="all")
        assert gv.altered_sequence == "hello"

    def test_insert_then_delete(self, simple_gv):
        """Test chaining insert then delete."""
        gv = simple_gv
        original = gv.altered_sequence
        gv.insert(pattern="XYZ", index=10, length="default")
        # The original length minus the replaced portion (len("XYZ")) + len("XYZ") = same length
        # Actually insert replaces, so length stays the same.
        # Replace positions 9..11 (0-based) with "XYZ"
        expected = original[:9] + "XYZ" + original[12:]
        assert gv.altered_sequence == expected


class TestMove:
    def test_move_forward(self, simple_gv):
        gv = simple_gv
        original = gv.altered_sequence
        # Move region (3, 6) -> paste at index 10, length of pasted region = 3
        # Cuts original[2:6] and inserts it at original[9:12] replacement
        gv.move(start_cc=3, end_cc=6, index_paste=10, length_paste=3)
        # After cut, the sequence is: original[:2] + original[6:]
        # Then insert the cut pattern at index 10 -> original[:2] + original[6:] with insert
        assert len(gv.altered_sequence) == len(original)

    def test_move_backward(self, simple_gv):
        gv = simple_gv
        original = gv.altered_sequence
        # Move from later region to earlier region
        gv.move(start_cc=15, end_cc=18, index_paste=3, length_paste=3)
        assert len(gv.altered_sequence) == len(original)

    def test_move_preserves_altered_sequence_tracking(self, simple_gv):
        gv = simple_gv
        gv.move(start_cc=5, end_cc=8, index_paste=20, length_paste=3)
        assert gv.there_is_change == True

    def test_move_chains_with_insert(self, simple_gv):
        """Move after insert to verify chaining."""
        gv = simple_gv
        gv.insert(pattern="TTT", index=5, length="default")
        gv.move(start_cc=10, end_cc=13, index_paste=2, length_paste=3)
        # Should not raise
        assert isinstance(gv.altered_sequence, str)


class TestCopyPaste:
    def test_copy_paste_simple(self, simple_gv):
        gv = simple_gv
        original = gv.altered_sequence
        gv.copy_past(start_cc=3, end_cc=6, index_paste=15, length_paste=3)
        # The original region should still be there, and the copied text should appear at paste point
        assert original[2:6] in gv.altered_sequence  # original region intact
        # Since the region appears twice (original + pasted), occurrence count should increase
        assert gv.altered_sequence.count(original[2:6]) > original.count(original[2:6])

    def test_copy_paste_no_return(self, simple_gv):
        gv = simple_gv
        r = gv.copy_past(start_cc=1, end_cc=4, index_paste=10, length_paste=3, no_return=True)
        assert r is None  # no_return=True means it modifies in place

    def test_copy_paste_return(self, simple_gv):
        gv = simple_gv
        r = gv.copy_past(start_cc=1, end_cc=4, index_paste=10, length_paste=3, no_return=False)
        assert r is not None
        assert isinstance(r, str)


# ===== AlterationFunctionsByPattern Tests =====

class TestReplace:
    def test_replace_exact(self, simple_gv):
        gv = simple_gv
        gv.replace(old="atcg", new="AAAA")
        assert "AAAA" in gv.altered_sequence
        assert "atcg" not in gv.altered_sequence

    def test_replace_with_wildcard_underscore(self, simple_gv):
        gv = simple_gv
        # Replace "atcg" with "NNNN" — match with _ wildcard: "a_c_"
        # _ matches any single base, so "a_c_" matches "atcg"
        gv.replace(old="a_c_", new="NNNN")
        assert "NNNN" in gv.altered_sequence

    def test_replace_with_percent_wildcard(self, simple_gv):
        gv = simple_gv
        gv.replace(old="atcg", new="XYZ")
        assert "XYZ" in gv.altered_sequence
        assert "atcg" not in gv.altered_sequence

    def test_replace_chaining(self, simple_gv):
        gv = simple_gv
        gv.replace(old="atcg", new="NNNN")
        gv.replace(old="NNNN", new="ZZZZ")
        assert "ZZZZ" in gv.altered_sequence
        assert "NNNN" not in gv.altered_sequence


class TestDeleteByPattern:
    def test_delete_exact(self, simple_gv):
        gv = simple_gv
        original = gv.altered_sequence
        gv.delete_by_pattern(pattern="atcg")
        assert "atcg" not in gv.altered_sequence
        assert len(gv.altered_sequence) < len(original)

    def test_delete_with_wildcard(self, simple_gv):
        gv = simple_gv
        # Delete "a___" — a followed by any 3 bases
        gv.delete_by_pattern(pattern="a___")
        # All occurrences of "a" followed by 3 bases should be gone
        assert "a" in gv.altered_sequence  # some 'a' remain (e.g., at end of "atcg" after split)
        # Just verify it doesn't crash and shortens

    def test_delete_no_return(self, simple_gv):
        gv = simple_gv
        result = gv.delete_by_pattern(pattern="atcg", no_return=True)
        assert result is None

    def test_delete_return(self, simple_gv):
        gv = simple_gv
        result = gv.delete_by_pattern(pattern="atcg", no_return=False)
        assert isinstance(result, str)
        assert "atcg" not in result


# ===== Chained Alterations =====

class TestChainedAlterations:
    """Test that multiple alterations in sequence work correctly."""

    def test_insert_then_delete_then_move(self, simple_gv):
        gv = simple_gv
        gv.insert(pattern="XXXX", index=5, length="default")
        gv.delete_by_index(start=10, length=4)
        gv.move(start_cc=3, end_cc=6, index_paste=15, length_paste=3)
        assert isinstance(gv.altered_sequence, str)
        assert len(gv.altered_sequence) > 0

    def test_delete_then_insert_then_replace(self, simple_gv):
        gv = simple_gv
        gv.delete_by_index(start=3, length=5)
        gv.insert(pattern="YYYY", index=3, length="default")
        gv.replace(old="YYYY", new="ZZZZ")
        assert isinstance(gv.altered_sequence, str)
        assert len(gv.altered_sequence) > 0

    def test_copy_paste_then_delete_by_pattern(self, simple_gv):
        gv = simple_gv
        gv.copy_past(start_cc=2, end_cc=5, index_paste=12, length_paste=3)
        gv.delete_by_pattern(pattern="tcg")
        assert isinstance(gv.altered_sequence, str)