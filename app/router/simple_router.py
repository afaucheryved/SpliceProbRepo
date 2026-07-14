#general importation
import traceback
from fastapi import APIRouter

#local importation
from app.schemas.general_schema import GeneticVariant
from app.schemas.typing import JSON
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
            # Use the factory to create a variant bound to a session. The factory
            # will generate a new session_id if none is provided and store the
            # base sequence in Redis.
            from app.domain.internal_gv_factory import create_internal_variant

            gv_instance = create_internal_variant(
                sequence=gv.sequence,
                mutations=gv.mutations,
                session_id=gv.session_id,
            )
            result = gv_instance.return_proba_simple()
            # Include the session identifier in the response so the client can
            # reuse it for subsequent mutation calls.
            result["session_id"] = gv_instance.session_id
            return result
    except Exception as e:
      traceback.print_exc()  # print in cmd
      raise
