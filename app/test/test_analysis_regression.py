import numpy as np
import pytest

from app.domain import genomic_analysis
from app.schemas.internal_gv_schema import InternalGeneticVariant


# Deterministic per-base "model score" used by the hight_impact_mutation_position
# fakes below: score at a position depends only on which nucleotide currently
# sits there, so results are directly comparable between a full-sequence call
# and an interval-scoped call at the corresponding absolute position.
_CHAR_SCORE = {
    "A": np.array([0.0, 0.10, 0.20]),
    "C": np.array([0.0, 0.30, 0.40]),
    "G": np.array([0.0, 0.50, 0.60]),
    "T": np.array([0.0, 0.70, 0.80]),
}


def _fake_get_single_base_score(sequence, position, models_used=None):
    return _CHAR_SCORE[sequence[position]]


def _fake_run_batches(sequences, models_used=None):
    return [np.array([_CHAR_SCORE[c] for c in seq]) for seq in sequences]


def test_zona_uses_internal_gv_for_probability_delta(monkeypatch):
    gv = InternalGeneticVariant(sequence="A")

    def fake_result_per_seqences(self, using_altered_seqence=False, write_on_file=False, print_cmd=False, return_json=True, specified_models_used=None):
        return {"acceptor_proba": {}, "donor_proba": {}}

    def fake_return_proba_delta(obj, non_altered_ref=None, altered_ref=None, specified_models_used=None):
        return {"delta": obj.result_per_seqences()}

    monkeypatch.setattr(genomic_analysis.gs, "result_per_seqences", fake_result_per_seqences)
    monkeypatch.setattr(genomic_analysis.gs, "return_proba_delta", fake_return_proba_delta)
    monkeypatch.setattr(genomic_analysis.IndependentScoring, "mut", lambda *args, **kwargs: 0.0)

    result = gv._zona(step=1, penality=1, threshold=10, specified_models_used={5})

    assert result == []


def test_pattern_in_zona_returns_empty_mapping_when_no_region_is_found(monkeypatch):
    gv = InternalGeneticVariant(sequence="ACGT")

    monkeypatch.setattr(gv, "_zona", lambda **kwargs: [])
    monkeypatch.setattr(genomic_analysis.wmf, "enumerate_window_mutants", lambda *args, **kwargs: {})
    monkeypatch.setattr(genomic_analysis.IndependentScoring, "mut", lambda *args, **kwargs: 0.0)

    result = gv.pattern_in_zona(step=1, penality=1, threshold=10, specified_models_used={5})

    assert result == {}


def test_hight_impact_mutation_position_interval_matches_full_sequence(monkeypatch):
    sequence = "ACGTACGTAC"
    gv = InternalGeneticVariant(sequence=sequence)

    monkeypatch.setattr(genomic_analysis.my_model, "get_single_base_score", _fake_get_single_base_score)
    monkeypatch.setattr(genomic_analysis.my_model, "run_batches", _fake_run_batches)

    interval = [2, 8]
    absolute_base = 5
    local_base = absolute_base - interval[0]

    full_result = gv.hight_impact_mutation_position(base=absolute_base, models_used={5})
    interval_result = gv.hight_impact_mutation_position(base=absolute_base, interval=interval, models_used={5})

    for region in ("donor", "acceptor"):
        for base_idx in range(4):
            assert interval_result[region][base_idx][local_base] == pytest.approx(
                full_result[region][base_idx][absolute_base]
            )


def test_hight_impact_mutation_position_out_of_range_base_raises(monkeypatch):
    sequence = "ACGTACGTAC"
    gv = InternalGeneticVariant(sequence=sequence)

    monkeypatch.setattr(genomic_analysis.my_model, "get_single_base_score", _fake_get_single_base_score)
    monkeypatch.setattr(genomic_analysis.my_model, "run_batches", _fake_run_batches)

    with pytest.raises(ValueError):
        gv.hight_impact_mutation_position(base=1, interval=[2, 8], models_used={5})


def test_hight_impact_mutation_position_return_shape(monkeypatch):
    sequence = "ACGT"
    gv = InternalGeneticVariant(sequence=sequence)

    monkeypatch.setattr(genomic_analysis.my_model, "get_single_base_score", _fake_get_single_base_score)
    monkeypatch.setattr(genomic_analysis.my_model, "run_batches", _fake_run_batches)

    result = gv.hight_impact_mutation_position(base=0, models_used={5})

    assert set(result.keys()) == {"donor", "acceptor"}
    for region in ("donor", "acceptor"):
        assert len(result[region]) == 4
        for base_scores in result[region]:
            assert len(base_scores) == len(sequence)
            assert all(isinstance(v, float) for v in base_scores)
