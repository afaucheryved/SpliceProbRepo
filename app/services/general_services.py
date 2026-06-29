#general importation
import json
import re

#local importation
from app.schemas.typing import mut, genome, JSON
from app.domain.spliceia_calculation import calcul_y
from app.test.global_var import GlobalVar
from app.errors.errors import InvalidMutationSyntax
from app.domain.initalize_my_model import my_model

class GenomicServices:

    def result_per_seqences(self, write_on_file: bool=False, print_cmd: bool=False, return_json: bool=True, specified_models_used: set[int] | None = None)->JSON | None:
        """
        put y results in a json object order by n° of sequences, saved in a .js file
        """
        y = my_model.run(self.sequence, models_used=specified_models_used)[0]
        
        acceptor=[float(x) for x in y[:, 1].tolist()]
        donor=[float(x) for x in y[:, 2].tolist()]

        proba = {
            "acceptor_proba": {i: {b: float(p)} for i, (b, p) in enumerate(zip(self.sequence, acceptor))},
            "donor_proba": {i: {b: float(p)} for i, (b, p) in enumerate(zip(self.sequence, donor))}
        }

        if print_cmd: print(f"altered sequence : {[p for p in proba]}")

        if write_on_file :
            with open(GlobalVar.PATH_FILE_JSON, "w") as f:
                json.dump(proba, f)
        if return_json :
            return proba

    def altered_sequence(self, mutations: mut)->str:
        """
        method altering the sequence with each mutation
        """
        altered_sequence = self.sequence
        for mut in mutations:
            # get the position and the new base of the mutation
            if mut !="": #empty mutation -> no change
                position_mutation = int("".join(c for c in mut if c.isdigit()))
                
                # base mutation
                altered_sequence = (
                    altered_sequence[:position_mutation-1]
                    + mut[-1]
                    + altered_sequence[position_mutation:]
                    )
        return altered_sequence

class ProbaServices :

    def return_proba_simple(self)-> JSON:
        """
        return proba json object for simple analysis
        """
        altered = GenomicServices.altered_sequence(self.sequence, self.mutations)
        result = GenomicServices.result_per_seqences(altered)
        result["altered sequence"] = altered
        return result
    
    def return_proba_delta(self, non_altered_ref: JSON | bool = False, specified_models_used: set[int] | None = None)->JSON:
        """
        return the json of probability of the altered sequence, with the variation between the two version
        """
        altered_seq = GenomicServices.altered_sequence(self.sequence, self.mutations)

        non_altered_result = non_altered_ref if non_altered_ref else GenomicServices.result_per_seqences(
            specified_models_used=specified_models_used
        )

        altered_result = GenomicServices.result_per_seqences(
            specified_models_used=specified_models_used
        )

        delta_score_result = {"acceptor_proba": {}, "donor_proba": {}}

        for key in ("acceptor_proba", "donor_proba"):
            for i in range(len(self.sequence)):
                altered_value = altered_result[key][i][altered_seq[i]]
                delta_value = altered_value - non_altered_result[key][i][self.sequence[i]]

                delta_score_result[key][i] = {"value": delta_value}

                try:
                    delta_score_result[key][i]["delta_proportion_variation"] = delta_value / altered_value
                except ZeroDivisionError:
                    delta_score_result[key][i]["delta_proportion_variation"] = -1

        delta_score_result["altered sequence"] = altered_seq
        delta_score_result["name"] = self.name
        return delta_score_result
    
