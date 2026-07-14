#global import
from fastapi import APIRouter, Query
from fastapi import FastAPI
from functools import wraps
import warnings

#local importation
from app.domain.internal_gv_factory import create_internal_variant
from app.domain.mixins import reconstruct_altered_sequence_history
from app.schemas.typing import *
from app.errors.errors_and_warnings import NotItalisedInternalGeneticVariant
from app.services.redis_session import get_session_data

router = APIRouter()


@router.get("/sequence")
async def get_sequence(session_id: str = Query(..., description="Session ID from a previous POST /GetSimpleProb/ or /GetDeltaScore/ call")):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=session_id,
        )
        return gv.sequence
    except Exception as e:
        raise Exception(f"Fail to get the 'sequence' of the current 'internal genetic variant' : {e}")

@router.get("/gv")
async def get_gv(session_id: str = Query(..., description="Session ID from a previous POST /GetSimpleProb/ or /GetDeltaScore/ call")):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=session_id,
        )
        return {
            k: v for k, v in vars(gv).items()
            if not (k.startswith('__') or k.startswith('_')) and not callable(v) and not isinstance(v, (staticmethod, classmethod, property))
        }
    except Exception as e:
        raise Exception(f"Fail to get static fields of the current 'internal genetic variant' : {e}")

@router.get("/simpleproba")
async def get_simpleproba(session_id: str = Query(..., description="Session ID from a previous POST /GetSimpleProb/ or /GetDeltaScore/ call")):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=session_id,
        )
        if gv.there_is_change == False:
            return gv.proba_simple
        else:
            gv.proba_simple = gv.return_proba_simple()
            return gv.proba_simple
    except Exception as e:
        raise Exception(f"Fail to get the 'simple_proba' of the current 'internal genetic variant' : {e}")

@router.get("/deltaproba")
@router.get("/delatproba")
async def get_deltaproba(session_id: str = Query(..., description="Session ID from a previous POST /GetSimpleProb/ or /GetDeltaScore/ call")):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=session_id,
        )
        if gv.there_is_change == False:
            return gv.proba_delta
        else:
            gv.proba_delta = gv.return_proba_delta()
            return gv.proba_delta
    except Exception as e:
        raise Exception(f"Fail to get the 'delta_proba' of the current 'internal genetic variant' : {e}")

@router.get("/mutations")
async def get_mutations(session_id: str = Query(..., description="Session ID from a previous POST /GetSimpleProb/ or /GetDeltaScore/ call")):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=session_id,
        )
        return gv.mutations
    except Exception as e:
        raise Exception(f"Fail to get the 'mutations' of the current 'internal genetic variant' : {e}")

@router.get("/allsimpleprobas")
async def get_allsimpleprobas(session_id: str = Query(..., description="Session ID from a previous POST /GetSimpleProb/ or /GetDeltaScore/ call")):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=session_id,
        )
        altered_list = get_session_data(gv.session_id, "altered_sequences") or []
        sequence_history = reconstruct_altered_sequence_history(gv.session_id)

        result = {}
        for i, (entry, altered_sequence) in enumerate(zip(altered_list, sequence_history), start=1):
            # Prefix with the 1-based step index: `mutation.human` alone is not
            # unique (e.g. "mutate_independently" is the same literal string on
            # every random-mutation call, and repeating the same insert/delete
            # twice repeats its label too) -- a plain dict keyed by label would
            # silently drop all but the last occurrence.
            label = f"{i}: {entry.get('mutation', {}).get('human', '')}"
            proba_simple = dict(entry.get("proba_simple", {}))
            proba_simple["altered sequence"] = altered_sequence
            # Per-position delta vs the base sequence, when available (Task 20)
            # -- only computed at tracking time for same-length entries; absent
            # otherwise, in which case the frontend falls back to the absolute
            # baseline-probability chart for that entry.
            if "delta_proba" in entry:
                proba_simple["delta_proba"] = entry["delta_proba"]
            if "match_start" in entry:
                proba_simple["match_start"] = entry["match_start"]
            if "match_end" in entry:
                proba_simple["match_end"] = entry["match_end"]
            result[label] = proba_simple
        return result
    except Exception as e:
        raise Exception(f"Fail to get 'allsimpleprobas' of the current 'internal genetic variant' : {e}")

@router.get("/alteredsequence")
async def get_alteredsequence(session_id: str = Query(..., description="Session ID from a previous POST /GetSimpleProb/ or /GetDeltaScore/ call")):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=session_id,
        )
        return gv.altered_sequence
    except Exception as e:
        raise Exception(f"Fail to get the 'altered_sequence' of the current 'internal genetic variant' : {e}")