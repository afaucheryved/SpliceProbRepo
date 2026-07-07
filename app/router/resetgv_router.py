#global import
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

#local importation
from app.domain.internal_gv_factory import create_internal_variant
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
        # Create a fresh variant instance via the session-based factory.
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