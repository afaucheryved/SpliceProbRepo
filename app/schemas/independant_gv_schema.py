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
