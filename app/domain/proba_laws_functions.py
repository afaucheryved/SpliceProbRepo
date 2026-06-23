#local import
from app.schemas.typing import *

class ProbaLawsFunctions :
    """
    used in 'RandomAlterationFonctions' functions
    """
    def mutate_base(prob_mat: MutationMatrix, base: str)-> str:
        """
        return the new base, depending on the probability matrix
        """
        return