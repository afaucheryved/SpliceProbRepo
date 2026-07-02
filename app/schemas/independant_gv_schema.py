#global import
import warnings
import re

#local import
from app.services.general_services import IndependentGeneralServices
from app.schemas.typing import *

class IndependentGeneticVariant(IndependentGeneralServices):
    def __init__(self, 
                 mutations: list[mut] = [""],
                sequence: genome = "",
                altered_sequence: genome = "",
                name: str = ""):
        IndependentGeneralServices.__init__(self)
        self.mutations = mutations
        self.sequence = sequence
        self.name = name
        self.altered_sequence = altered_sequence  
        if altered_sequence == "":
            self.apply_mutations()
            
    def apply_mutations(self) -> NoReturn:
        """
        Returns the altered sequence corresponding to the input sequence altered by each mutation.
        Each mutation corepond to the following syntaxe : ">p.A.B>C" : the base number A, which was a B become a C. OR : "" (no mutation)
        ! -> the base 1 is the first one (start to count from 1, according to the biological convention)
        Raise warning if a same base is modified twice or more (because we don't care about the mutations order)
        """
        pattern = re.compile(r"^>p\.(\d+)\.[A-Za-z]>([A-Za-z])$")

        try:
            # sequence is most likely a str, which is immutable -> work on a list
            new_sequence = list(self.sequence)
            check_if_modified = [False for _ in range(len(self.sequence))]

            for mut in self.mutations:
                if mut == "":
                    continue 

                match = pattern.match(mut)
                if not match:
                    raise ValueError(f"Invalid mutation syntax: {mut!r}")

                loc_bio = int(match.group(1))
                new_base = match.group(2)

                new_sequence[loc_bio - 1] = new_base

                if not check_if_modified[loc_bio - 1]:
                    check_if_modified[loc_bio - 1] = True
                else:
                    warnings.warn(
                        f"In apply_mutation() : You can only apply 1 or 0 mutation for each base.\n"
                        f"Modifie the base: {self.sequence[loc_bio - 1]} at: {loc_bio} (biological convention) twice or more."
                    )
            self.altered_sequence = "".join(new_sequence)

        except Exception as e:
            raise Exception(f"Unexpected exception at apply_mutations() : {e}") from e
