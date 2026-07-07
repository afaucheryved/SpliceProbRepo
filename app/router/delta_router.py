#local importation
from fastapi import APIRouter
import traceback
from app.schemas.general_schema import GeneticVariant
from app.schemas.typing import JSON
from app.domain.calcul_function import IsValid
from app.schemas.internal_gv_schema import InternalGeneticVariant

router = APIRouter()

@router.post("/GetDeltaScore/")
async def return_delta_proba_json(gv: GeneticVariant):
    """
    the 'sequence' is not altered by the mutation. We create the altered one later in order to calulate the delat score
    'Delta score' means the difference between the acceptor and donor score before and after the mutation
    mutation syntaxe : " >p.8.a>c " : means the 8th base become a "c" instead of an "a".
    !: a mutation at the position 1 is about the FIRST base.
    
    It is for single use requests
    """
    try:
        if IsValid.test_mutations(gv.mutations) and IsValid.test_sequence(gv.sequence):
            # Use the factory to obtain a session‑aware variant.
            from app.domain.internal_gv_factory import create_internal_variant

            gv_instance = create_internal_variant(
                sequence=gv.sequence,
                mutations=gv.mutations,
                session_id=gv.session_id,
            )
            result = gv_instance.return_proba_delta()
            # Include the session identifier for the client.
            result["session_id"] = gv_instance.session_id
            return result
    except Exception as e:
        traceback.print_exc()  # print in cmd
        raise