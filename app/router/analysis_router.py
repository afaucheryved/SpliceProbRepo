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