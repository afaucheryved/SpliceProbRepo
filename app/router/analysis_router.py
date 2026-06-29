#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
from app.domain.initalize_instances import my_internal_genetic_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each analysis function :

class PatternInZonaParameters(BaseModel): # parameter for the private method : _zona()
    step: int | None = None
    penality: int | None = None
    threshold: percentage | None = None
    specified_models_used: list[int] | None = None

@router.post("/patterninzona")
async def patterninzona(p: PatternInZonaParameters) -> dict[set[mut], float]:
    try:
        return my_internal_genetic_variant.pattern_in_zona(step=p.step, penality=p.penality, threshold=p.threshold, specified_models_used=p.specified_models_used)
    except Exception as e:
        raise e(f"unexpected exception : {e}")