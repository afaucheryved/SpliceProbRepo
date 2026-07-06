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

@router.post("/gv")
async def get_sequence():
    try:
        return {
        k: v for k, v in vars(my_internal_genetic_variant).items()
        if not (k.startswith('__') or k.startswith('_')) and not callable(v) and not isinstance(v, (staticmethod, classmethod, property))
    } # considering only static fiels 
    except Exception as e:
        raise Exception(f"fail to get static fields of the curent 'internal genitic variant' : {e}")

@router.post("/simpleproba")
async def get_sequence():
    try:
        return my_internal_genetic_variant.simple_proba
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")

@router.post("/delatproba")
async def get_sequence():
    try:
        return my_internal_genetic_variant.delta_proba
    except Exception as e:
        raise Exception(f"fail to get sequence of the curent 'internal genitic variant' : {e}")