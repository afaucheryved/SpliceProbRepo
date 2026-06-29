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
from app.services.general_services import (ProbaServices, 
                                           GenomicServices)


class InternalGeneticVariant(AlterationFunctionsByIndex, 
                                           AlterationFunctionsByPattern,
                                           SequenceFactory, 
                                           RandomAlterationFunctions, 
                                           WindowMutationFunctions, 
                                           ImportanceSplicingSearch, 
                                           IsValid, 
                                           Scoring, 
                                           ProbaServices, 
                                           GenomicServices): # for domain layer use only
    """
        alter-ego of GeneticVariant, for domain layer uses.
        Inherits of all functions from sequence_function and genomic_analysis
    """
    counter = 0
    def __init__(self, name: str | None = None, mutations: list[mut] = [""], sequence: genome = "", altered_sequences: genome = ""):
        """
        
        """
        AlterationFunctionsByIndex.__init__(self)
        AlterationFunctionsByPattern.__init__(self)
        SequenceFactory.__init__(self)
        RandomAlterationFunctions.__init__(self)
        WindowMutationFunctions.__init__(self)
        ImportanceSplicingSearch.__init__(self)
        IsValid.__init__(self)
        Scoring.__init__(self)
        ProbaServices.__init__(self)
        GenomicServices.__init__(self)
        
        if name is not None:
            self.name = name
        else:
            self.name = f"sequence #{self.counter}"
            InternalGeneticVariant.counter+=1
        self.mutations = mutations
        self.sequence = sequence
        self.altered_sequences = altered_sequences