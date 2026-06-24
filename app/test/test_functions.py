#global import
from functools import wraps
import tensorflow as tf

#local import
from app.domain.sequence_functions import WindowMutationFunctions
from app.domain.genomic_analysis import ImportanceSplicingSearch as iss
from app.domain.genomic_analysis import SpliceAIModels, get_gradients, tf_integrated_gradients
from app.domain.spliceia_calculation import one_hot_encoder

# tool test
def print_dic_lisible(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        d = func(*args, **kwargs)

        for muts, genome in d.items():
            print(f"{muts} -> {genome}")

        return d

    return wrapper

def clean_string(s: str) -> str:
    """
    Supprime de la chaîne :
    - les chiffres (0-9)
    - les espaces
    - les retours à la ligne
    """
    return "".join(c for c in s if not c.isdigit() and c not in " \n\t\r")
# var test

sequence = "acgt"#"agttgccaagggagcatatggcaaataattaatgacagtttgctatggcctttctcatagAacatactccatctggccttccgctgctttatcagggtcatctaattatttaggaaatgcAagcagcttcccttagatggcacgttggtggtagctgtatgtgtctgtggggtgtccaggcctgaaacatcaagacccatgacttatcatttgaatagatgtggtacacagtggcagatatagaccccctcatgtccacacaggctttcgtgtgtgctaactccctcgtgcactggaacgcggtaatttcctgtgcttctttccagATCGTGCACAGAACTCTGGCGGCCATGCTGGGTTCCCTTGCAGCACTGGCAGCACTGGCTGTGATTGGCGATgtaagttgtcacagtcccaatccctggcttaccactcagtgggatgtcagctcaaagatgttccaggattcaggctttcgctGgttttttcactattttatatgccacgtccatgtttttgcccaagaaccatgctagaggtAtgaactaacaagctacagcattgaagagtacttttcattaggttttgtcacacactcacAtcccagtggtgtgattcctcatcgtggtggaggaaaggctcctcatgggcatgtttgccTagggctgtggagctgggttgtgatggggctggatctgggtgttggaactagaggggaccGtcctagctggtgcagaaaggtgggagtcagttgggccagggtctgtcctgaagagatcaggaggcccctggagaggcgtgtttggggatgagggtgtcctgtttgg"


# function test

def function_test():
    return iss._zona(clean_string(sequence), 10, 5, 1)

my_model = SpliceAIModels()
input_sequence = one_hot_encoder({"genom": sequence})
# it works! -> print(my_model.call(one_hot_encoder({"genom": "acgt"})))

output = get_gradients(my_model, one_hot_encoder({"genom": sequence}), 1, 1)

output2 = tf_integrated_gradients(my_model, input_sequence, 1, 1)
print(output2)
