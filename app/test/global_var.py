#general importation
from dataclasses import dataclass

#local importation
from app.schemas.typing import path

@dataclass
class GlobalVar:
    """
    Contains global variabvles
    """
    #parameters
    CONTEXT: int= 10000

    #paths
    PATH_FILE_FA: path="" # read
    PATH_FILE_JSON: path="test/proba.json" # write

    #bases manipulation
    BASES: str="acgt"