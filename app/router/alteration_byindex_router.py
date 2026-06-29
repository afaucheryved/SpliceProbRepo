#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
from app.domain.initialize_internal_gv import my_internal_genetic_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each alteration function

class DeletParameters(BaseModel):
    start: int = 0
    end: int | None = None
    length: int | None = None
    
class InsertParameters(BaseModel):
    pattern: str = ""
    index: int = 0
    length: int = 0

class MoveParameters(BaseModel):
    start_cc: int = 0
    end_cc: int = 0
    index_paste: int = 0
    length_past: int = 0

class CopyPasteParameters(BaseModel):
    start_cc: int = 0
    end_cc: int = 0
    index_paste: int = 0
    length_past: int = 0

# one async post function for each alteration fucntion

@router.post("/delet")
async def delet(p: DeletParameters):
    try:
        if p.end is None and p.length is not None:
            my_internal_genetic_variant.delete_by_index(start = p.start, end = p.end)
            
        elif p.end is not None and p.length is None:
            my_internal_genetic_variant.delete_by_index(start = p.start, length = p.end)
        
        else:
            raise ValueError("you cannot use both 'length' and 'end' parameters")
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")

@router.post("/insert")
async def insert(p: InsertParameters):
    try:
        my_internal_genetic_variant.insert(p.pattern, p.index, p.length) 
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")

@router.post("/move")
async def move(p: MoveParameters):
    try:
        my_internal_genetic_variant.move(start_cc=p.start_cc, end_cc=p.end_cc, index_paste=p.index_paste, length_paste=p.length_past)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")

@router.post("/copypast")
async def coupy_past(p: CopyPasteParameters):
    try:
        my_internal_genetic_variant.copy_past(start_cc=p.start_cc, end_cc=p.end_cc, index_paste=p.index_paste, length_paste=p.length_past)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")
