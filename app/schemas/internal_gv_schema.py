# global import
import warnings
import re

#local import
from app.schemas.typing import *
from app.domain.sequence_functions import (AlterationFunctionsByIndex, 
                                           AlterationFunctionsByPattern,
                                           SequenceFactory, 
                                           RandomAlterationFunctions, 
                                           WindowMutationFunctions)
from app.domain.genomic_analysis import ImportanceSplicingSearch
from app.domain.calcul_function import (IsValid, 
                                        Scoring)
from app.services.general_services import GeneralServices
from app.errors.errors_and_warnings import CurrentBaseToMutateDoesntMach


class InternalGeneticVariant(AlterationFunctionsByIndex, 
                                           AlterationFunctionsByPattern,
                                           SequenceFactory, 
                                           RandomAlterationFunctions, 
                                           WindowMutationFunctions, 
                                           ImportanceSplicingSearch, 
                                           IsValid, 
                                           Scoring, 
                                           GeneralServices): # for domain layer use only
    """
        alter-ego of GeneticVariant, for domain layer uses.
        Inherits of all functions from sequence_function and genomic_analysis
    """
    counter = 0
    def __init__(self, 
                 name: str | None = None, 
                 mutations: list[mut] = [""], 
                 sequence: genome = "", 
                 altered_sequence: genome = ""):
        AlterationFunctionsByIndex.__init__(self)
        AlterationFunctionsByPattern.__init__(self)
        SequenceFactory.__init__(self)
        RandomAlterationFunctions.__init__(self)
        WindowMutationFunctions.__init__(self)
        ImportanceSplicingSearch.__init__(self)
        IsValid.__init__(self)
        Scoring.__init__(self)
        GeneralServices.__init__(self)
        
        if name is not None:
            self.name = name
        else:
            self.name = f"sequence #{self.counter}"
            InternalGeneticVariant.counter+=1
        self.mutations = mutations
        self.sequence = sequence
        self.altered_sequence = sequence
        self.apply_mutations()
        self.proba_simple: JSON = {}
        self.proba_delta: JSON = {}
        self.there_is_change = False
    
    def apply_mutations(self) -> NoReturn:
        """
        Returns the altered sequence corresponding to the input sequence altered by each mutation.
        Each mutation corepond to the following syntaxe : ">p.A.B>C" : the base number A, which was a B become a C. OR : "" (no mutation)
        ! -> the base 1 is the first one (start to count from 1, according to the biological convention)
        Raise warning if a same base is modified twice or more (because we don't care about the mutations order)
        """
        pattern = re.compile(r"^>p\.(\d+)\.([A-Za-z])>([A-Za-z])$")

        try:
            # altered_sequence -> work on a list
            new_sequence = list(self.altered_sequence)
            check_if_modified = [False for _ in range(len(self.altered_sequence))]

            for mut in self.mutations:
                if mut == "":
                    continue

                match = pattern.match(mut)
                if not match:
                    raise ValueError(f"Invalid mutation syntax: {mut!r}")

                loc_bio = int(match.group(1))
                expected_base = match.group(2)
                new_base = match.group(3)

                current_base = new_sequence[loc_bio - 1]
                if current_base.upper() != expected_base.upper():
                    warnings.warn(
                        f"In apply_mutations() : expected base {expected_base!r} at "
                        f"position {loc_bio} (biological convention) but found "
                        f"{current_base!r} instead. Mutation implemented nonetheless.",
                        CurrentBaseToMutateDoesntMach,
                    )

                new_sequence[loc_bio - 1] = new_base

                if not check_if_modified[loc_bio - 1]:
                    check_if_modified[loc_bio - 1] = True
                else:
                    warnings.warn(
                        f"In apply_mutations() : You can only apply 1 or 0 mutation for each base.\n"
                        f"Modifie the base: {current_base} at: {loc_bio} (biological convention) twice or more."
                    )
            self.altered_sequence = "".join(new_sequence)

        except Exception as e:
            raise Exception(f"Unexpected exception at apply_mutations() at line {e} : {e}") from e