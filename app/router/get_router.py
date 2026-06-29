#global import
from fastapi import APIRouter, FastAPI

#local importation
from app.domain.initialize_internal_gv import my_internal_genetic_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each alteration function

@router.post("/sequence")
async def get_sequence():
    try:
        return my_internal_genetic_variant.sequence
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")