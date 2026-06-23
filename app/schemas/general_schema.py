from pydantic import BaseModel, field_validator

class GeneticVariant(BaseModel):
    """
    includes the data to work on base mutations in the sequence.
    Contain the original sequence + a set of mutations bases by bases.
    """
    name: str
    mutations: list[str]
    sequence: str
    altered_sequences: str =""

    @field_validator('sequence')
    @classmethod
    def clean_sequence(cls, v: str) -> str:
        """
        to clean sequence to avoid json error
        """
        return v.strip().replace('\n', '').replace('\r', '')
