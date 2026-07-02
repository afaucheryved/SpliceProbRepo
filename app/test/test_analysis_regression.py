import pytest

from app.domain import genomic_analysis
from app.schemas.internal_gv_schema import InternalGeneticVariant


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
