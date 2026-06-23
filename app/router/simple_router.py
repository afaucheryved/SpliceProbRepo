#general importation
import traceback
from fastapi import APIRouter

#local importation
from app.schemas.general_schema import GeneticVariant
from app.schemas.typing import JSON
from app.services.general_services import ProbaServices, IsValid

router = APIRouter()

@router.post("/GetSimpleProb/")
async def return_simple_proba_json(gv: GeneticVariant):
    """
    return the JSON of proba
    """
    try:
      if IsValid.mutations(gv.mutations) and IsValid.sequence(gv.sequence):
        result= ProbaServices.return_proba_simple(gv)
        return result
    except Exception as e:
      traceback.print_exc()  # print in cmd
      raise
