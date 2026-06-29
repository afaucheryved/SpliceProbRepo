#local importation
from fastapi import APIRouter
import traceback
from app.schemas.general_schema import GeneticVariant
from app.schemas.typing import JSON
from app.services.general_services import ProbaServices
from app.domain.calcul_function import IsValid
from app.schemas.general_schema import InternalGeneticVariant

router = APIRouter()

@router.post("/GetDeltaScore/")
async def return_delta_proba_json(gv: GeneticVariant):
    """
    the 'sequence' is not altered by the mutation. We create the altered one later in order to calulate the delat score
    'Delta score' means the difference between the acceptor and donor score before and after the mutation
    mutation syntaxe : " >p.8.a>c " : means the 8th base become a "c" instead of an "a".
    Warning : a mutation at the position 1 is about the FIRST base.
    
    It is for single use requests
    """
    try:
        if IsValid.mutations(gv.mutations) and IsValid.sequence(gv.sequence):
            single_use_gv = InternalGeneticVariant(gv.sequence)
            result = single_use_gv.return_proba_delta()
            return result
    except Exception as e:
        traceback.print_exc()  # print in cmd
        raise