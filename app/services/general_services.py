#general importation
import json
import re

#local importation
from app.schemas.typing import mut, genome, JSON
from app.domain.spliceia_calculation import calcul_y
from app.test.global_var import GlobalVar
from app.schemas.general_schema import GeneticVariant
from app.errors.errors import InvalidMutationSyntax
from app.main import my_model

class GenomicServices:

    def result_per_seqences(altered: genome, write_on_file: bool=False, print_cmd: bool=False, return_json: bool=True, specified_models_used: set[int] | None = None)->JSON | None:
        """
        put y results in a json object order by n° of sequences, saved in a .js file
        """
        y = my_model.call(altered) #calcul_y({"genome to calcul" : altered}, 10000, specified_models_used = specified_models_used) # y is a tuple[list[int], list[int], list[int]]
        acceptor=[float(x) for x in y[:, 1].tolist()]
        donor=[float(x) for x in y[:, 2].tolist()]

        proba = {
            "acceptor_proba": {i: {b: float(p)} for i, (b, p) in enumerate(zip(altered, acceptor))},
            "donor_proba": {i: {b: float(p)} for i, (b, p) in enumerate(zip(altered, donor))}
        }

        if print_cmd: print(f"altered sequence : {[p for p in proba]}")

        if write_on_file :
            with open(GlobalVar.PATH_FILE_JSON, "w") as f:
                json.dump(proba, f)
        if return_json :
            return proba

    def altered_sequence(sequence: genome, mutations: mut)->str:
        """
        method altering the sequence with each mutation
        """
        altered_sequence = sequence
        for mut in mutations:
            # get the position and the new base of the mutation
            position_mutation = int("".join(c for c in mut if c.isdigit()))
            
            # base mutation
            altered_sequence = (
                altered_sequence[:position_mutation-1]
                + mut[-1]
                + altered_sequence[position_mutation:]
                )
        return altered_sequence

class ProbaServices :

    def return_proba_simple(gv: GeneticVariant)-> JSON:
        """
        return proba json object for simple analysis
        """
        altered = GenomicServices.altered_sequence(gv.sequence, gv.mutations)
        result = GenomicServices.result_per_seqences(altered, 
                                    print_cmd=False,
                                    write_on_file=False, 
                                    return_json=True)
        result["altered sequence"] = altered
        return result
    
    def return_proba_delta(gv: GeneticVariant, non_altered_ref: JSON | bool = False, specified_models_used: set[int] | None = None)->JSON:
        """
        return the json of probability of the altered sequence, with the variation between the two version
        """
        altered_seq = GenomicServices.altered_sequence(gv.sequence, gv.mutations)

        if not non_altered_ref:
            non_altered_result = GenomicServices.result_per_seqences(
                gv.sequence,
                specified_models_used = specified_models_used
            )
        else: # if the non_altered_result is the same in a loop using return proba delta
            non_altered_result = non_altered_ref

        altered_result = GenomicServices.result_per_seqences(
            altered_seq,
            specified_models_used = specified_models_used
        )

        delta_score_result = {"acceptor_proba": {}, "donor_proba": {}}

        for i in range(len(gv.sequence)):
            delta_score_result["acceptor_proba"][i] = {}
            delta_acceptor_proba_i = (
                altered_result["acceptor_proba"][i][altered_seq[i]]
                - non_altered_result["acceptor_proba"][i][gv.sequence[i]]
            )
            delta_score_result["acceptor_proba"][i]["value"] = delta_acceptor_proba_i

            try:
                delta_score_result["acceptor_proba"][i]["delta_proportion_variation"] = (
                    delta_acceptor_proba_i
                    / altered_result["acceptor_proba"][i][altered_seq[i]]
                )
            except ZeroDivisionError:
                delta_score_result["acceptor_proba"][i]["delta_proportion_variation"] = -1

        for i in range(len(gv.sequence)):
            delta_score_result["donor_proba"][i] = {}
            delta_donor_proba = (
                altered_result["donor_proba"][i][altered_seq[i]]
                - non_altered_result["donor_proba"][i][gv.sequence[i]]
            )
            delta_score_result["donor_proba"][i]["value"] = delta_donor_proba

            try:
                delta_score_result["donor_proba"][i]["delta_proportion_variation"] = (
                    delta_donor_proba
                    / altered_result["donor_proba"][i][altered_seq[i]]
                )
            except ZeroDivisionError:
                delta_score_result["donor_proba"][i]["delta_proportion_variation"] = -1

        delta_score_result["altered sequence"] = altered_seq
        delta_score_result["name"] = gv.name
        return delta_score_result
    
