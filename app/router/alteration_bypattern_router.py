#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
from app.domain.initialization.initialize_internal_gv import my_internal_genetic_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each alteration function

class ReplaceParameters(BaseModel):
    old: genome = ""
    new: genome = ""

class DeletParameters(BaseModel):
    pattern: genome = ""
    
# one async post function for each alteration fucntion

@router.post("/replace")
async def replace(p: ReplaceParameters):
    try:
        my_internal_genetic_variant.replace(new=p.new, old=p.old)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")
    
@router.post("/delet")
async def delet(p: DeletParameters):
    try:
        my_internal_genetic_variant.delete_by_pattern(pattern=p.pattern)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")