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

class DeletParameters(BaseModel):
    start: int = 0
    end: int | None = None
    length: int | None = None
    # Optional session identifier for multi‑user isolation.
    session_id: str | None = None
    
class InsertParameters(BaseModel):
    pattern: str = ""
    index: int = 0
    length: int = 0
    session_id: str | None = None

class MoveParameters(BaseModel):
    start_cc: int = 0
    end_cc: int = 0
    index_paste: int = 0
    length_paste: int = 0
    session_id: str | None = None

class CopyPasteParameters(BaseModel):
    start_cc: int = 0
    end_cc: int = 0
    index_paste: int = 0
    length_paste: int = 0
    session_id: str | None = None

# one async post function for each alteration fucntion

@router.post("/delete")
@router.post("/delet")
async def delet(p: DeletParameters):
    try:
        # Obtain a session‑aware variant instance.
        gv = create_internal_variant(
            sequence="",  # The base sequence will be fetched from the session if available.
            mutations=[],
            session_id=p.session_id,
        )
        if p.end is None and p.length is not None:
            gv.delete_by_index(start=p.start, end=p.end)
        elif p.end is not None and p.length is None:
            gv.delete_by_index(start=p.start, length=p.end)
        else:
            raise ValueError("you cannot use both 'length' and 'end' parameters")
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")

@router.post("/insert")
async def insert(p: InsertParameters):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        gv.insert(pattern=p.pattern, index=p.index, length=p.length)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")

@router.post("/move")
async def move(p: MoveParameters):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        gv.move(start_cc=p.start_cc, end_cc=p.end_cc, index_paste=p.index_paste, length_paste=p.length_paste)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")

@router.post("/copypast")
async def coupy_past(p: CopyPasteParameters):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        gv.copy_past(start_cc=p.start_cc, end_cc=p.end_cc, index_paste=p.index_paste, length_paste=p.length_paste)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")
