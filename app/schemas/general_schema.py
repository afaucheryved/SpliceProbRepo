#global import
from pydantic import BaseModel, field_validator

#local import
from app.schemas.typing import *


class GeneticVariant(BaseModel): # switch to using InternalGeneticVariant for the domain layer
    """
    includes the data to work on base mutations in the sequence.
    Contain the original sequence + a set of mutations bases by bases.
    """
    name: str
    mutations: list[str] = [""]
    sequence: str = ""
    altered_sequence: str = ""
    # Optional session identifier for multi‑user isolation. If omitted a new
    # UUID will be generated on the first request that requires a session.
    session_id: str | None = None

    @field_validator('sequence')
    @classmethod
    def clean_sequence(cls, v: str) -> str:
        """
        to clean sequence to avoid json error
        """
        return v.strip().replace('\n', '').replace('\r', '')

