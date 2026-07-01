from app.schemas.independant_gv_schema import IndependentGeneticVariant


def test_independent_variant_keeps_mutations_as_flat_list():
    gv = IndependentGeneticVariant(
        mutations=[">p.1.a>c", ">p.3.t>g"],
        sequence="acgt",
    )

    assert isinstance(gv.mutations, list)
    assert gv.mutations == [">p.1.a>c", ">p.3.t>g"]
    gv.apply_mutations()
    assert gv.sequence == "ccgt"
