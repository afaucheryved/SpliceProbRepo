#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
from app.domain.internal_gv_factory import create_internal_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each analysis function :

class PatternInZonaParameters(BaseModel): # parameter for the private method : _zona()
    step: int | None = None
    penality: int | None = None
    threshold: percentage | None = None
    specified_models_used: list[int] | None = None
    # Optional session identifier for multi‑user isolation.
    session_id: str | None = None

@router.post("/patterninzona")
async def patterninzona(p: PatternInZonaParameters) -> dict[set[mut], float]:
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        return gv.pattern_in_zona(step=p.step,
                                  penality=p.penality,
                                  threshold=p.threshold,
                                  specified_models_used=p.specified_models_used)
    except Exception as e:
        raise Exception(f"fail to get pattern_in_zona analysis of 'internal genetic variant' : {e}")

class HighImpactMutationPositionParameters(BaseModel): # parameter for hight_impact_mutation_position()
    base: int
    # Optional [start, end) sub-region of the sequence to scan -- lets a caller
    # scope the analysis to a sub-region for performance instead of scanning
    # the full sequence.
    interval: list[int] | None = None
    models_used: list[int] | None = None
    # Optional session identifier for multi‑user isolation.
    session_id: str | None = None

@router.post("/highimpactposition")
async def highimpactposition(p: HighImpactMutationPositionParameters) -> JSON:
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        result = gv.hight_impact_mutation_position(
            base=p.base,
            interval=p.interval,
            models_used=p.models_used,
        )
        # hight_impact_mutation_position()'s scores are numpy.float32
        # (from array subtraction) -- Pydantic/FastAPI cannot JSON-serialize
        # those directly, so cast to native floats at the API boundary.
        return {
            region: [[float(v) for v in row] for row in rows]
            for region, rows in result.items()
        }
    except Exception as e:
        raise Exception(f"fail to get hight_impact_mutation_position analysis of 'internal genetic variant' : {e}")

class RubberWindowParameters(BaseModel): # parameter for rubber_window()
    exon: list[int]
    interval: list[int] | None = None
    # Two mutually exclusive tiling modes -- see rubber_window()'s own
    # docstring. Leave both unset for the function's default (fixed
    # window_size=5) tiling.
    window_size: int | None = None
    all_window_size: list[int] | None = None
    models_used: list[int] | None = None
    batch_size: int | None = None
    # First-pass zone search (SpotPositionFunctions._zona) that narrows down
    # which parts of the sequence rubber_window() actually tiles -- see
    # rubber_window()'s own docstring / _zona()'s.
    first_search_window_size: int | None = None
    first_search_step: int | None = None
    keep_prop: percentage | None = None
    top_more_relevent: int | None = None
    # "repressor" (default) keeps windows whose masking raised the donor/acceptor
    # score (an inhibitor was removed); "activator" keeps windows whose masking
    # lowered it (an enhancer was removed) -- see rubber_window()'s docstring.
    search_activator_repressor: str | None = None
    # Optional session identifier for multi‑user isolation.
    session_id: str | None = None

@router.post("/rubberwindow")
async def rubberwindow(p: RubberWindowParameters) -> JSON:
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        # rubber_window() itself defaults these -- only override when the
        # caller actually supplied a value, since the signature does not
        # accept None for any of them.
        optional_kwargs = {
            key: value
            for key, value in {
                "batch_size": p.batch_size,
                "first_search_window_size": p.first_search_window_size,
                "first_search_step": p.first_search_step,
                "keep_prop": p.keep_prop,
                "top_more_relevent": p.top_more_relevent,
                "search_activator_repressor": p.search_activator_repressor,
            }.items()
            if value is not None
        }
        result = gv.rubber_window(
            exon=p.exon,
            interval=p.interval,
            window_size=p.window_size,
            all_window_size=p.all_window_size,
            models_used=p.models_used,
            **optional_kwargs,
        )
        # rubber_window() now returns {"analysis": [donor_segments, acceptor_segments],
        # "sequence lenght": int, "exon": [int, int]}: each segment is a dict with a
        # numpy.float32 "value" -- not directly JSON-serializable, so cast to a native
        # float at the API boundary, the same reasoning /highimpactposition already
        # applies.
        return {
            "analysis": [
                [{**segment, "value": float(segment["value"])} for segment in segments]
                for segments in result["analysis"]
            ],
            "sequence lenght": result["sequence lenght"],
            "exon": result["exon"],
        }
    except Exception as e:
        raise Exception(f"fail to get rubber_window analysis of 'internal genetic variant' : {e}")