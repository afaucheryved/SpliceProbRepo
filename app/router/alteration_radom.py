#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
from app.domain.internal_gv_factory import create_internal_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each alteration function

class MutateIndependentlyParameters(BaseModel):
    prob_mat: MutationMatrix = [[1, 0, 0, 0], 
                                [0, 1, 0, 0], 
                                [0, 0, 1, 0], 
                                [0, 0, 0, 1]]
    simulated_phenomenon: str | None = None # specific phenomenon to implement by the future simulkated by a specific method or matrix ?
    # Optional session identifier for multi‑user isolation.
    session_id: str | None = None

@router.post("/mutateindependently")
async def mutate_independentely(p: MutateIndependentlyParameters):
    try:
        gv = create_internal_variant(
            sequence="",
            mutations=[],
            session_id=p.session_id,
        )
        gv.mutate_independently(prob_mat=p.prob_mat)
    except Exception as e:
        raise Exception(f"fail to get sequence of the current 'internal genetic variant' : {e}")