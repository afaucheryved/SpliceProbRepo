#global import
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

#local importation
from app.domain.initialization.initialize_internal_gv import my_internal_genetic_variant
from app.schemas.typing import *
from app.schemas.internal_gv_schema import InternalGeneticVariant
from app.domain.spliceai_calculation import tuple_mutation

router = APIRouter()

# one BaseModel for a new GeneticVariant instance
class NewGeneticVariantParameters(BaseModel):
    name: str | None = None
    sequence: genome = ""
    mutations: list[mut] = [""]
    altered_sequence: genome = ""

@router.post("/resetgv")
async def reset_genetic_variant(p: NewGeneticVariantParameters):
    try:
        my_internal_genetic_variant.__init__(name=p.name, 
                                             mutations=p.mutations, 
                                             sequence=p.sequence,
                                             altered_sequence=p.altered_sequence
                                             )
        my_internal_genetic_variant.there_is_change = True
    except Exception as e:
        raise Exception(f"fail to reset the curent 'internal genitic variant' : {e}")