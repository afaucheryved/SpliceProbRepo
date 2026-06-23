#general import
import itertools
import re
import numpy as np
import numpy.typing as npt
import random

#local import
from app.schemas.typing import *
from app.domain.proba_laws_functions import ProbaLawsFunctions
from app.domain.spliceia_calculation import tuple_mutation
from app.test.global_var import GlobalVar

class AlterationByIndexFunctions:

    """
    This class provides functions that operate on ATCG sequences by index.
    They return the new sequence.
    """

    @staticmethod
    def insert_pattern(sequence: genome,
                            pattern :str, 
                            index :int,
                            length : str | int = 0 )-> genome:
        """
        Place an ATCG pattern at an index over a specified length of the sequence (replacing the existing bases if length != 0).
        If length = ":", then the length is the distance from the index to the end of the sequence. 
        Example:
                pattern = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", length = 16

                                    PLACE (replacing)
            -> ...atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg...
                                    |----------------|
                                   index    (length) |_____
                                    |                      |_____
                                    |                            |____
                                    |aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
        """
        idx0 = index - 1  # convert to 0-based

        # Determine the replacement length.
        if length == ":":
            replace_length = len(sequence) - idx0
        elif length == 0:
            replace_length = len(pattern)
        else:
            replace_length = length

        # Truncate or pad the pattern so that it has a length of exactly replace_length.
        if len(pattern) >= replace_length:
            insert = pattern[:replace_length]
        else:
            insert = pattern + sequence[idx0 + len(pattern):idx0 + replace_length]

        return sequence[:idx0] + insert + sequence[idx0 + replace_length:]
    
    @staticmethod
    def delete_pattern(sequence: genome, 
                       start : int, 
                       end : int | None = None,
                       length: int | str | None = None)-> genome:
        """
        DELETEEe the bases beteen the position 'start' and 'end'.
        You can use 'length' parameter instead of 'end'.
        If length = ":", then the length is the distance from the index to the end of the sequence.
        Example:
                        
                                        DELETEEeED
            -> ...atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg...
                                    |----------------|
                                   start  (length)  end
        """
        start0 = start - 1  # convert to 0-based

        if length is not None:
            if length == ":":
                end0 = len(sequence)
            else:
                end0 = start0 + length
        elif end is None:
            end0 = len(sequence)
        else:
            end0 = end  # inclusive 1-based end == exclusive 0-based end

        return sequence[:start0] + sequence[end0:]
    
    @staticmethod
    def move_pattern(sequence: genome, 
                     start_cc: int,
                     end_cc: int,
                     index_paste: int,
                     length_paste: str | int = 0)-> genome:
        """
        Cut and paste a sequence.
        If length = ":", then the length is the distance from the index to the end of the sequence.
        Example:
                        
                         CUT                                    PASTE
            -> ...atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg...
                    |-----------|                      |---------------------|
                 start_cc     end_cc               index_paste   (length_past)                                                  
                        

        """
        start0 = start_cc - 1   # convert to 0-based
        end0 = end_cc            # inclusive 1-based end == exclusive 0-based end

        pattern = sequence[start0:end0]
        new_sequence = AlterationByIndexFunctions.delete_pattern(sequence, start_cc, end_cc)

        # Adjusts index_paste if the paste point was located after the deleted area.
        cut_length = end0 - start0
        if index_paste > start_cc:
            index_paste -= cut_length

        return AlterationByIndexFunctions.insert_pattern(new_sequence, pattern, index_paste, length_paste)
    
    @staticmethod
    def copy_past_pattern(sequence: genome, 
                     start_cc: int,
                     end_cc: int, 
                     index_paste: int,
                     length_paste: str | int = 0)-> genome:
        """
        Copy and paste a sequence.
        Example:
                        
                        COPY                                    PASTE
            -> ...atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg...
                    |-----------|                      |---------------------|
                 start_cc     end_cc               index_paste   (length_past)                                                  
                        

        """
        start0 = start_cc - 1
        end0 = end_cc

        pattern = sequence[start0:end0]
        return AlterationByIndexFunctions.insert_pattern(sequence, pattern, index_paste, length_paste)

class AlterationByPatternFunctions:

    """
    This class provides functions that operate on ATCG sequences.
    The entire input sequence is processed by the functions.
    They return the new sequence.
    """

    @staticmethod
    def _pattern_to_regex(pattern: str) -> str:
        """
        Convert a pattern containing wildcards into a regex pattern.
        "_" matches exactly one ATCG base.
        "%(n)" matches any sequence of up to n ATCG bases.
        "%" alone (no parentheses) matches a sequence of any length (0 to infinity).
        """
        regex_parts = []
        i = 0
        while i < len(pattern):
            char = pattern[i]

            if char == "_":
                # Matches exactly one base
                regex_parts.append("[ATCGatcg]")
                i += 1

            elif char == "%":
                # Check for "%(n)" syntax
                match = re.match(r"%\((\d+)\)", pattern[i:])
                if match:
                    n = match.group(1)
                    # Matches up to n bases (0 to n)
                    regex_parts.append(f"[ATCGatcg]{{0,{n}}}")
                    i += match.end()
                else:
                    # Bare "%" -> matches a sequence of any length
                    regex_parts.append("[ATCGatcg]*")
                    i += 1

            else:
                # Literal base, escaped for safety
                regex_parts.append(re.escape(char))
                i += 1

        return "".join(regex_parts)
    
    @staticmethod
    def replace_pattern(sequence: genome, 
                            old: str, 
                            new: str)-> genome:
        """
        Replace one nucleotide pattern with another.
        ! -> "_" is a wildcard character (matches exactly one ATCG base).
        ! -> "%(n)" is a wildcard character (matches any sequence of up to 'n' ATCG bases).
        Example:

            old = "cc_c", new = "aaaa"
                               REPLACE                  REPLACE
            -> ...atcgatcgatcgatccccgatcgatcgatcgatcgatcgatcctcgatcgatcgatcgatcgatcg...
                                |--|                       |--|
                                aaaa                       aaaa
                                

        """
        regex_pattern = AlterationByPatternFunctions._pattern_to_regex(old)
        return re.sub(regex_pattern, new, sequence)
    
    @staticmethod
    def delete_pattern(sequence: genome, 
                       pattern: str, 
                       )-> genome:
        """
        ! -> "_" is a wildcard character (replaces 1 atcg base).
        ! -> "%(n)" is a wildcard character (matches any sequence of up to 'n' ATCG bases).
        Example:

            pattern = "cc_c"
                               DELETE                     DELETE
            -> ...atcgatcgatcgatccccgatcgatcgatcgatcgatcgatcctcgatcgatcgatcgatcgatcg...
                                |--|                       |--|                                                    
        """
        regex_pattern = AlterationByPatternFunctions._pattern_to_regex(pattern)
        return re.sub(regex_pattern, "", sequence)

class SequenceFactory:

    """
    Functions for generating sequences.
    """
    
    @staticmethod
    def repeat(pattern: str, nbr: int, 
                start_pattern: str="", 
                end_pattern: str="")-> genome:
        """
        Repeat a pattern a specified number of times, with optional prefixes and suffixes.
        Example:

            pattern = "atcg", nbr = 10, start_pattern = "aaaa", end_pattern = "cccc"
            
            --> aaaaatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgcccc
            <start> |              <loop>                   | <end>
        """
        return start_pattern + (pattern * nbr) + end_pattern
    
    @staticmethod
    def merge(sequences: list[genome])-> genome:
        """
        Return the merged sequence.

        Example:

            sequences = ["aaaa", "tttt", "cccc", "gggg"]
            
            --> aaaattttccccgggg
        """
        return "".join(sequences)

class RandomAlterationFunctions:
    """
    Returns randomly mutated ATCG sequences following user-defined probability distributions,
    using probability distributions defined by the ProbaLawsFunctions class.
    """
    @staticmethod
    def proba_law(base: str, prob_mat: MutationMatrix) -> str:
        """
        Randomly mutate a single base according to the mutation probability matrix.

        Example:

            If prob_mat[0][1] = 0.01 (A -> C), then calling proba_law("A", prob_mat)
            has a 1% chance of returning "C".
        """
        # Find the row index corresponding to the input base
        base_index = GlobalVar.BASES.index(base.upper())

        # Get the probability distribution for this base (row of the matrix)
        probabilities = prob_mat[base_index]

        # Pick a new base according to the probability distribution
        new_base = random.choices(GlobalVar.BASES, weights=probabilities, k=1)[0]

        # Preserve the original case (lower/upper) of the input base
        return new_base.lower() if base.islower() else new_base
    
    @staticmethod
    def mutate_independently(sequence: genome, 
                     prob_mat: MutationMatrix
                   )-> genome:
        """
        Apply the mutation probability matrix independently to each base.

        Example:

            If prob_mat[0][1] = 0.01, then an "A" has a 1% chance of becoming a "C".
        """
        return "".join(
            RandomAlterationFunctions.proba_law(base, prob_mat)
            for base in sequence
        )


class WindowMutationFunctions:
    
    @staticmethod
    def enumerate_window_mutants(sequence: genome,
                      start: int, end: int, step: int,
                      window: int = 3, 
                      only_different_bases: bool = True, 
                      max_char: int = 1_000_000,
                      not_return_muted_sequence: bool = False)-> dict[tuple[mut, ...], genome]:
        """
        Returns the dictionary of versions of the sequence
        1: of a specific window position; 
        2: of a version of a possible window mutant of that window.

        Example:

                sequence = "atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg",
                step = 3, start = 0, end = len(sequence)
                window = 4

                so the windows positions [] are, between 'start' and 'end' :
                        ...[atcg][atcg][atcg][atcg]...

                and for each window, the possible window mutants are [gcta], [cctc], etc... such that no base remains at its original position(only_different_bases is True).

                so, a possible version of the sequence is:
                                CHANGE
                        --> atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg
                                |--|
                                gcta

                so, each version of the sequence is entirely defined by a tuple of mutations. In the previous case:
                        --> (">p.5.a>g", ">p.6.t>c", ...)
        Possible improvement: return a `window_mutats` object that stores the base sequence and the set of mutations, and—by design—returns the entire desired mutated sequence upon request.
        """
        output: dict[tuple, str] = {}
        nbr_char = 0

        for i in range(start, end - window + 1, step):
            left_seq = sequence[:i]
            seq = sequence[i:i + window]
            right_seq = sequence[i + window:]

            # Iterate over every possible base combination (a, t, c, g), not just
            # the bases already present in the current window.
            mutant_sequences = itertools.product(GlobalVar.BASES, repeat=window)

            for p in mutant_sequences:
                perm = "".join(p)
                if (
                    all(seq[k] != perm[k] for k in range(len(perm)))  # Ensures that no base remains unchanged at its original position.
                    or (not only_different_bases)
                ):
                    new_sequence = "" if not_return_muted_sequence else left_seq + perm + right_seq
                    t_m = tuple_mutation(old=sequence, new=new_sequence)
                    output[t_m] = new_sequence
                    nbr_char += len(perm) if not_return_muted_sequence else len(new_sequence)

                    if nbr_char >= max_char:
                        return output

        return output