#global import
from typing import *
import numpy as np
import numpy.typing as npt


type path = str #path acces file (.fa)
type genome = str #which contains only 'actgATCG'
type mut = str # mutation : ">p.A.B>C" : the base number A, which was a B become a C. OR : "" (no mutation)
type JSON = dict[str,Any]
type MutationMatrix = npt.NDArray[np.float64] # 4 * 4
type percentage = int