#general importation
import json
import re
import warnings

#local importation
from app.schemas.typing import *
from app.test.global_var import GlobalVar
from app.domain.initialization.initalize_my_model import my_model

def compute_delta_result(sequence: str, altered_sequence: str, non_altered_result: JSON, altered_result: JSON) -> JSON:
    """Per-position delta (altered - base) for acceptor/donor probabilities.

    Pure function extracted from ``GeneralServices.return_proba_delta`` so it
    can be reused (e.g. by ``_track_alteration`` for Task 20's per-tracked-entry
    delta charts) without going through ``return_proba_delta``'s own
    ``apply_mutations()`` call, which mutates ``self.sequence``/``self.altered_sequence``
    based on ``self.mutations`` -- not a safe side effect to trigger from
    inside alteration tracking, where ``self.mutations`` isn't necessarily
    empty and isn't related to the tracked alteration at all.

    Args:
        sequence: the base (non-altered) sequence.
        altered_sequence: the altered sequence -- must be the same length as
            ``sequence`` (position-wise diff only makes sense then).
        non_altered_result: ``result_per_sequences()``-shaped dict for ``sequence``.
        altered_result: ``result_per_sequences()``-shaped dict for ``altered_sequence``.
    """
    delta_score_result = {"acceptor_proba": {}, "donor_proba": {}}
    for key in ("acceptor_proba", "donor_proba"):
        for i in range(len(altered_sequence)):
            altered_value = altered_result[key][i][altered_sequence[i]]
            delta_value = altered_value - non_altered_result[key][i][sequence[i]]

            delta_score_result[key][i] = {"value": delta_value}

            try:
                delta_score_result[key][i]["delta_proportion_variation"] = delta_value / altered_value
            except ZeroDivisionError:
                delta_score_result[key][i]["delta_proportion_variation"] = -1
    return delta_score_result


class GeneralServices:
    """
    Base class providing sequence mutation and scoring services.
    
    Subclasses can override `_mutations_target_attr` to control which
    attribute the mutated sequence is written to (default: ``"sequence"``).
    """

    #: Name of the attribute to store the mutated sequence in.
    #: Override to ``"altered_sequence"`` in subclasses that must keep
    #: the original sequence intact.
    _mutations_target_attr: str = "sequence"

    def result_per_sequences(self, 
                             using_altered_sequence: bool = False, 
                             write_on_file: bool=False, 
                             print_cmd: bool=False, 
                             return_json: bool=True, 
                             specified_models_used: set[int] | None = None)->JSON | None:
        """
        put y results in a json object order by n° of sequences, saved in a .js file
        """
        if using_altered_sequence:
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

    def apply_mutations(self) -> None:
        """
        Applies mutations to the sequence and stores the result in the
        attribute named by ``self._mutations_target_attr``.
        
        Each mutation uses the syntax: ``>p.<pos>.<ref>><alt>``.
        Raises a warning if a base is modified more than once.
        """
        target = getattr(self, self._mutations_target_attr)
        pattern = re.compile(r"^>p\.(\d+)\.[A-Za-z]>([A-Za-z])$")

        try:
            new_sequence = list(target)
            check_if_modified = [False for _ in range(len(target))]

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
                        f"Modifie the base: {target[loc_bio - 1]} at: {loc_bio} (biological convention) twice or more."
                    )
            setattr(self, self._mutations_target_attr, "".join(new_sequence))

        except Exception as e:
            raise Exception(f"Unexpected exception at apply_mutations() : {e}") from e

    def return_proba_simple(self)-> JSON:
        """
        return proba json object for simple analysis
        """
        self.apply_mutations()
        result = self.result_per_sequences()
        result["altered sequence"] = getattr(self, self._mutations_target_attr)
        return result
    
    def return_proba_delta(self, 
                           non_altered_ref: JSON | None = None, 
                           altered_ref: JSON | None = None, 
                           specified_models_used: set[int] | None = None)->JSON:
        """
        return the json of probability of the altered sequence, with the variation between the two version
        """
        self.apply_mutations()
        
        non_altered_result = non_altered_ref if non_altered_ref else self.result_per_sequences(
                                                                                                specified_models_used=specified_models_used
                                                                                                    )
        altered_result = altered_ref if altered_ref else self.result_per_sequences(
                                                                                    using_altered_sequence=True,                                                                              
                                                                                    specified_models_used=specified_models_used
                                                                                            
                                                                                        )
        delta_score_result = compute_delta_result(self.sequence, self.altered_sequence, non_altered_result, altered_result)
        delta_score_result["altered sequence"] = self.altered_sequence
        delta_score_result["name"] = self.name
        return delta_score_result


class IndependentGeneralServices(GeneralServices):
    """
    Subclass of GeneralServices that stores the mutated result in 
    ``self.altered_sequence`` instead of mutating ``self.sequence`` directly.
    
    The only difference from the parent is the class attribute
    ``_mutations_target_attr`` set to ``"altered_sequence"``.
    No method overrides are needed.
    """

    _mutations_target_attr = "altered_sequence"
