#global import
from fastapi import APIRouter, FastAPI
from functools import wraps
import warnings

#local importation
from app.domain.initialization.initialize_internal_gv import my_internal_genetic_variant
from app.schemas.typing import *
from app.errors.errors_and_warnings import NotItalisedInternalGeneticVariant

router = APIRouter()

# check decorator to see if current 'internal genitic variant' static fields are empty or not.

def check_initialized(endpoint_funct):
    @wraps
    def wrapper(*args, **kwargs):
        if my_internal_genetic_variant.sequence == "":
                return endpoint_funct(*args, **kwargs)
        else:
            warnings.warn(NotItalisedInternalGeneticVariant())
            return endpoint_funct(*args, **kwargs)
        

@check_initialized
@router.get("/sequence")
async def get_sequence():
    try:
        return my_internal_genetic_variant.sequence
    except Exception as e:
        raise Exception(f"Fail to get the static field 'sequence' of the current 'internal genitic variant' : {e}")

@check_initialized
@router.get("/gv")
async def get_sequence():
    try:
        return {
        k: v for k, v in vars(my_internal_genetic_variant).items()
        if not (k.startswith('__') or k.startswith('_')) and not callable(v) and not isinstance(v, (staticmethod, classmethod, property))
    } # considering only static fiels 
    except Exception as e:
        raise Exception(f"Fail to get static fields of the current 'internal genitic variant' : {e}")

@check_initialized
@router.get("/simpleproba")
async def get_sequence():
    try:
        return my_internal_genetic_variant.simple_proba
    except Exception as e:
        raise Exception(f"Fail to get the static field 'simple_proba' of the current 'internal genitic variant' : {e}")

@check_initialized
@router.get("/delatproba")
async def get_sequence():
    try:
        return my_internal_genetic_variant.delta_proba
    except Exception as e:
        raise Exception(f"Fail to get the static field 'delta_proba' of the current 'internal genitic variant' : {e}")

@check_initialized
@router.get("/mutations")
async def get_sequence():
    try:
        return my_internal_genetic_variant.mutations
    except Exception as e:
        raise Exception(f"Fail to get the static field 'mutations' of the current 'internal genitic variant' : {e}")

@check_initialized
@router.get("/alteredsequence")
async def get_sequence():
    try:
        return my_internal_genetic_variant.altered_sequence
    except Exception as e:
        raise Exception(f"Fail to get the static field 'altered_sequence' of the current 'internal genitic variant' : {e}")