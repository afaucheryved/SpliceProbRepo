#global import
import re
import bisect

#local import
from app.schemas.typing import *
from app.errors.errors import InvalidMutationSyntax


class IsValid:
    """
    Cheks input syntax.
    """
    def test_mutations(mutations: list[str]) -> bool:
        for s in mutations:
            """
            verifies a mutation syntaxe
            """
            if not bool(re.match(r"^>p\.\d+\.[atgc]>[atgc]$", s)) and not s=="":
                raise InvalidMutationSyntax(
                    f"Mutation '{s}' does not match syntax: >p.<pos>.<ref>><alt> or \"\" (no mutation)"
                )
        return True
    
    def test_sequence(sequence: str) -> bool:
        """
        Verifies the sequence syntaxe
        """
        return bool(re.match(r"^[ACGTacgt]+$", sequence))

class Scoring:
    """
    Calculat score.
    """
    def mut(proba_delta: JSON, method="euclidian", proba_simple: JSON | None = None)->float:
        """
        Return a score quantifying the importance of a mutation regarding the change in splicing scores.
        Here, it is the norm of the vector composed of the values from 'proba_json'(acceptor and donor summed in one vector).

        The proposed norms are: 'euclidean' (default), 'manhattan', 'pondered' and 'quadratic'.
        """

        for key in ("acceptor_proba", "donor_proba"): #proba
            proba_delta_ad = proba_delta[key]
            for i in proba_delta_ad:
                match method:
                    case "euclidian" | "manhattan" | "quadratic":
                        add_value = proba_delta_ad[i]["value"]
                    case "pondered":
                        add_value = proba_delta_ad[i]["value"]*abs(next(iter(proba_simple[key][i].values())))
                    case _:
                        add_value = 0
                sum_delta_score.append(add_value)

        sum_delta_score = np.array(sum_delta_score)

        match method.strip().lower():
            case "euclidian" | "pondered":
                return float(np.sqrt(np.sum(sum_delta_score ** 2)))
            case "manhattan":
                return float(np.sum(np.abs(sum_delta_score)))
            case "quadratic":
                return float(np.sqrt(np.mean(sum_delta_score ** 2)))
            case _:
                raise ValueError(f"ERROR: the method '{method}' is not recognized.")