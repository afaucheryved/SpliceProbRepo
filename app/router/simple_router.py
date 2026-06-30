#general importation
import traceback
from fastapi import APIRouter

#local importation
from app.schemas.general_schema import GeneticVariant
from app.schemas.typing import JSON
from app.services.general_services import ProbaServices
from app.domain.calcul_function import IsValid
from app.schemas.internal_gv_schema import InternalGeneticVariant

router = APIRouter()

@router.post("/GetSimpleProb/")
async def return_simple_proba_json(gv: GeneticVariant):
    """
    return the JSON of proba.
    It is for single use requests
    """
    try:
      if IsValid.test_mutations(gv.mutations) and IsValid.test_sequence(gv.sequence):
        single_use_gv = InternalGeneticVariant(gv.sequence)
        result = single_use_gv.return_proba_delta()
        return result
    except Exception as e:
      traceback.print_exc()  # print in cmd
      raise
