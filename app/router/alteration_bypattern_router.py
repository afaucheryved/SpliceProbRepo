#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
# Import the factory to obtain a session‑aware InternalGeneticVariant instance.
from app.domain.internal_gv_factory import create_internal_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each alteration function

class ReplaceParameters(BaseModel):
    old: genome = ""
    new: genome = ""
    session_id: str | None = None

class DeletParameters(BaseModel):
    pattern: genome = ""
    session_id: str | None = None
    
# one async post function for each alteration fucntion

@router.post("/replace")
async def replace(p: ReplaceParameters):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        gv.replace(old=p.old, new=p.new)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")
    
@router.post("/delete")
@router.post("/delet")
async def delet(p: DeletParameters):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        gv.delete_by_pattern(pattern=p.pattern)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")