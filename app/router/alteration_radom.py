#global import
from fastapi import APIRouter, FastAPI
import traceback
from pydantic import BaseModel

#local importation
from app.domain.initialization.initialize_internal_gv import my_internal_genetic_variant
from app.schemas.typing import *

router = APIRouter()

# one BaseModel for each alteration function

class MutateIndependentlyParameters(BaseModel):
    prob_mat: MutationMatrix = [[1, 0, 0, 0], 
                                [0, 1, 0, 0], 
                                [0, 0, 1, 0], 
                                [0, 0, 0, 1]]
    simulated_phenomenon: str | None = None # specific phenomenon to implement by the future simulkated by a specific method or matrix ?

@router.post("/mutateindependently")
async def mutate_independentely(p: MutateIndependentlyParameters):
    try:
        my_internal_genetic_variant.mutate_independently(prob_mat=p.prob_mat)
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")