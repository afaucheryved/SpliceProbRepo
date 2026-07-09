#global import
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

#local importation
from app.domain.internal_gv_factory import (
    create_internal_variant,
    reset_session_state,
)
from app.schemas.typing import *
from app.schemas.internal_gv_schema import InternalGeneticVariant
from app.domain.spliceai_calculation import tuple_mutation

router = APIRouter()

# one BaseModel for a new GeneticVariant instance
class NewGeneticVariantParameters(BaseModel):
    name: str | None = None
    sequence: genome = ""
    mutations: list[mut] = [""]
    altered_sequence: genome = ""
    # Optional session identifier for multi‑user isolation.
    session_id: str | None = None

@router.post("/resetgv")
async def reset_genetic_variant(p: NewGeneticVariantParameters):
    try:
        # If a session_id is provided AND a non-empty sequence is given,
        # reset the session in-place (overwrite base_sequence, clear history).
        if p.session_id is not None and p.sequence.strip():
            reset_session_state(p.session_id, p.sequence)
            gv = create_internal_variant(
                sequence=p.sequence,
                mutations=p.mutations,
                session_id=p.session_id,
            )
        else:
            # Preserve the original behaviour: mint a new session or reconnect
            # without changing the existing base_sequence.
            gv = create_internal_variant(
                sequence=p.sequence,
                mutations=p.mutations,
                session_id=p.session_id,
            )
        gv.name = p.name or gv.name
        gv.there_is_change = True
        return {"session_id": gv.session_id, "status": "reset"}
    except Exception as e:
        raise Exception(f"fail to reset the current 'internal genetic variant' : {e}")
