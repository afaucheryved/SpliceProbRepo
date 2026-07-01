#general importation
import json
import re
import warnings

#local importation
from app.schemas.typing import *
from app.test.global_var import GlobalVar
from app.domain.initalize_my_model import my_model

class GeneralServices:

    def result_per_seqences(self, using_altered_seqence: bool = False, write_on_file: bool=False, print_cmd: bool=False, return_json: bool=True, specified_models_used: set[int] | None = None)->JSON | None:
        """
        put y results in a json object order by n° of sequences, saved in a .js file
        """
        if using_altered_seqence:
            current_sequence_used = self.altered_sequence
            y = my_model.run(x_input = self.altered_sequence, models_used=specified_models_used)[0]
            
        else:
            current_sequence_used = self.sequence
            y = my_model.run(x_input = self.sequence, models_used=specified_models_used)[0]
        
        acceptor=[float(x) for x in y[:, 1].tolist()]
        donor=[float(x) for x in y[:, 2].tolist()]

        proba = {
            "acceptor_proba": {i: {b: float(p)} for i, (b, p) in enumerate(zip(current_sequence_used, acceptor))},
            "donor_proba": {i: {b: float(p)} for i, (b, p) in enumerate(zip(current_sequence_used, donor))}
        }

        if print_cmd: print(f"altered sequence : {[p for p in proba]}")

        if write_on_file :
            with open(GlobalVar.PATH_FILE_JSON, "w") as f:
                json.dump(proba, f)
        if return_json :
            return proba

    def apply_mutations(self) -> NoReturn:
        """
        Returns the altered sequence corresponding to the input sequence altered by each mutation.
        Each mutation corepond to the following syntaxe : ">p.A.B>C" : the base number A, which was a B become a C. OR : "" (no mutation)
        ! -> the base 1 is the first one (start to count from 1, according to the biological convention)
        Raise warning if a same base is modified twice or more (because we don't care about the mutations order)
        """
        pattern = re.compile(r"^>p\.(\d+)\.[A-Za-z]>([A-Za-z])$")

        try:
            # sequence is most likely a str, which is immutable -> work on a list
            new_sequence = list(self.sequence)
            check_if_modified = [False for _ in range(len(self.sequence))]

            for mut in self.mutations:
                if mut == "":
                    continue 

                match = pattern.match(mut)
                if not match:
                    raise ValueError(f"Invalid mutation syntax: {mut!r}")

                loc_bio = int(match.group(1))
                new_base = match.group(2)

                new_sequence[loc_bio - 1] = new_base

                if not check_if_modified[loc_bio - 1]:
                    check_if_modified[loc_bio - 1] = True
                else:
                    warnings.warn(
                        f"In apply_mutation() : You can only apply 1 or 0 mutation for each base.\n"
                        f"Modifie the base: {self.sequence[loc_bio - 1]} at: {loc_bio} (biological convention) twice or more."
                    )
            self.sequence = "".join(new_sequence)

        except Exception as e:
            raise Exception(f"Unexpected exception at apply_mutations() : {e}") from e

    def return_proba_simple(self)-> JSON:
        """
        return proba json object for simple analysis
        """
        altered = self.apply_mutations(self)
        result = self.result_per_seqences(self)
        result["altered sequence"] = altered
        return result
    
    def return_proba_delta(self, non_altered_ref: JSON | None = None, altered_ref: JSON | None = None, specified_models_used: set[int] | None = None)->JSON:
        """
        return the json of probability of the altered sequence, with the variation between the two version
        """
        GeneralServices.apply_mutations(self)
        print("------------------")
        print(f"self.altered_sequence == self.sequence: {self.altered_sequence == self.sequence}") # --> False
        print("------------------")
        
        non_altered_result = non_altered_ref if non_altered_ref else self.result_per_seqences(
                                                                                                specified_models_used=specified_models_used
                                                                                                    )
        altered_result = altered_ref if altered_ref else self.result_per_seqences(
                                                                                    using_altered_seqence=True,                                                                              
                                                                                    specified_models_used=specified_models_used
                                                                                            
                                                                                        )
        delta_score_result = {"acceptor_proba": {}, "donor_proba": {}}

        for key in ("acceptor_proba", "donor_proba"):
            for i in range(len(self.sequence)):
                altered_value = altered_result[key][i][self.altered_sequence[i]]
                delta_value = altered_value - non_altered_result[key][i][self.sequence[i]]

                delta_score_result[key][i] = {"value": delta_value}

                try:
                    delta_score_result[key][i]["delta_proportion_variation"] = delta_value / altered_value
                except ZeroDivisionError:
                    delta_score_result[key][i]["delta_proportion_variation"] = -1

        delta_score_result["altered sequence"] = self.altered_sequence
        delta_score_result["name"] = self.name
        return delta_score_result
    
