#general import
import numpy as np
import random as rd
import ruptures as rpt
import matplotlib.pyplot as plt

#local import
from app.schemas.typing import mut
from app.schemas.typing import *
from app.services.general_services import ProbaServices as ps, GenomicServices as gs
from app.domain.sequence_functions import AlterationByIndexFunctions as abif
from app.domain.calcul_function import Scoring
from app.test.global_var import GlobalVar
from app.schemas.general_schema import GeneticVariant

class ImportanceSplicingSearch:
    """
    Have a function that identify the patterns and locations having the greatest impact on splicing probabilities changes.
    Returns a dictionary mapping each position to an importance score regarding the splicing process.
    """

    def _zona(sequence: genome, 
                step: int = 5,
                penality: int = 1,
                threshold: percentage = 20,
                specified_models_used = {5}) -> list[list[int]]:
        """
        It returns, as a list of pairs, the boundaries of the intervals corresponding to regions that significantly impact splicing probabilities (segment/change-point detection), using "ruptures" library.
        To achieve this, the function introduces random mutations every X basesand calculates the delta score.
        The results are then combined on a per-base basis, allowing for the identification of regions where values exceed the threshold.
        """
        #--- step 1 : calculate each mutation's score

        intervals = []
        mut_score = []
        non_altered_ref = gs.result_per_seqences(sequence, specified_models_used = specified_models_used)

        # try a random mutation on a base every 'step' bases.
        for base_i in range(0, len(sequence), step):
            base_mutation = rd.choice([b for b in GlobalVar.BASES if b != sequence[base_i]]) # must change
            mutation = f">p.{base_i+1}.{sequence[base_i]}>{base_mutation}" # standart .fa file notation

            # deduce the corresponding genetic variant
            gv = GeneticVariant(
                name = "_", # useless here
                mutations = [mutation], # only one mutation
                sequence = sequence ,   
                altered_sequences = "_", #useless here
                )

            score_mutation = Scoring.mut(ps.return_proba_delta(gv, non_altered_ref, specified_models_used={5}))
            mut_score.append(score_mutation)
        
        #--- in the case of a really short sequence
        plt.plot(mut_score) # debug
        plt.show()
        if len(mut_score) < 2:
            print("len(mut_score) < 2")
            if len(mut_score) == 1 and mut_score[0] > threshold / 100 * abs(mut_score[0]): # sup  sert à rien ?
                print("len(mut_score) == 1 and mut_score[0] > threshold / 100 * abs(mut_score[0])")
                return [[0, len(sequence) - 1]]
            return []

        #--- setp 2 : determine intervals with 'ruptures' module

        algo = rpt.Pelt(model="rbf").fit(np.array(mut_score))
        boundaries = [0] + algo.predict(pen=penality) # to have the first interval

        mut_score_median = np.median(mut_score) # or mean ?
    
        for i in range(len(boundaries) - 1):

            b_start, b_end = boundaries[i], boundaries[i + 1]
            segment_median = np.median(mut_score[b_start:b_end])

            if segment_median > mut_score_median + threshold/100 * abs(mut_score_median):
                # reconversion des indices "mut_score" vers les positions réelles
                real_start = b_start * step
                real_end = min(b_end * step, len(sequence) - 1)
                intervals.append([real_start, real_end])
        print("__________________________")
        return intervals
        

    @staticmethod
    def pattern_in_zona(sequence: genome, 
                            zona_intervales: list[list[int]]) -> dict[set[mut], float] :
        """
        Uses 'enumerate_window_mutants' followed by 'calcul_y' and 'Scoring.mut', 
        to identify the patterns most significant for altering the splicing score within the previously identified regions of importance.
        """
        return
    