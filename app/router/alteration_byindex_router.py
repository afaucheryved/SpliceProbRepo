#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
from app.domain.initalize_instances import my_internal_genetic_variant

router = APIRouter()

# one class for each alteration function

class DeletParameters(BaseModel):
    start: int = 0
    end: int | None = None
    length: int | None = None
    
class InsertPattern(BaseModel):
    pattern: str = ""
    index: int = 0
    length: int = 0

@router.post("/delet")
async def delet(p: DeletParameters):
    try:
        if p.end is None and p.length is not None:
            my_internal_genetic_variant.delete(start = p.start, end = p.end)
            
        elif p.end is not None and p.length is None:
            my_internal_genetic_variant.delete(start = p.start, length = p.end)
        
        else:
            raise ValueError("you cannot use both 'length' and 'end' parameters")
    except Exception as e:
        raise e(f"unexpected exception : {e}")

@router.post("/insert")
async def insert(p: InsertPattern):
    try:
        my_internal_genetic_variant.insert(p.pattern, p.index, p.lenght)
    except Exception as e:
        raise e(f"unexpected exception : {e}")
