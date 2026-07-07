#general import
import itertools
import re
import numpy as np
import numpy.typing as npt
import random

#local import
from app.schemas.typing import *
from app.domain.spliceai_calculation import tuple_mutation
from app.test.global_var import GlobalVar
from app.domain.mixins import AlteredSequenceTrackerMixin

class AlterationFunctionsByIndex(AlteredSequenceTrackerMixin):

    """
    This class provides functions that operate on ATCG sequences by index.
    They return the new sequence.
    """

    def insert(self,
                pattern: str, 
                index: int,
                length: int | str = "default", 
                no_return: bool = True)-> genome | NoReturn:
        """
        Place an ATCG pattern at an index over a specified length of the altered_sequence.
        If length is not "default" or all, or not specified, the '(lenght)' is 'len(pattern)'. 
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
        self.there_is_change = True
        idx0 = index - 1  # convert to 0-based

        # Determine the replacement length.
        if length == "default":
            replace_length = len(pattern)
        elif length == "all":
            replace_length = len(self.altered_sequence)
        else:
            replace_length = length

        new_sequence = (
            self.altered_sequence[:idx0]
            + pattern
            + self.altered_sequence[idx0 + replace_length:]
        )

        if no_return:
            self.altered_sequence = new_sequence
            # Track the insertion mutation
            self._track_alteration(f"insert:{pattern}@{index}")
        else:
            return new_sequence
            
    def delete_by_index(self, 
                       start : int, 
                       end : int | None = None,
                       length: int | str | None = None, 
                       no_return: bool = True)-> genome | NoReturn:
        """
        DELETE the bases beteen the position 'start' and 'end'.
        You can use 'length' parameter instead of 'end'.
        If length = "all", then the length is the distance from the index to the end of the sequence.
        Example:
                        
                                          DELETE
            -> ...atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg...
                                    |----------------|
                                   start  (length)  end
        """
        self.there_is_change = True
        start0 = start - 1  # convert to 0-based

        if length is not None:
            if length == "all":
                end0 = len(self.altered_sequence)
            else:
                end0 = start0 + length
        elif end is None:
            end0 = len(self.altered_sequence)
        else:
            end0 = end  # inclusive 1-based end == exclusive 0-based end
        if no_return:
            self.altered_sequence = self.altered_sequence[:start0] + self.altered_sequence[end0:]
            # Track the deletion mutation (simple start index label)
            self._track_alteration(f"delete:{start}")
        else:
            return self.altered_sequence[:start0] + self.altered_sequence[end0:]

    def move(self, 
                     start_cc: int,
                     end_cc: int,
                     index_paste: int,
                     length_paste: str | int = 0, 
                     no_return: bool = True)-> genome | NoReturn:
        """
        Cut and paste a sequence.
        If length = ":", then the length is the distance from the index to the end of the sequence.
        Example:
                        
                         CUT                                    PASTE
            -> ...atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg...
                    |-----------|                      |---------------------|
                 start_cc     end_cc               index_paste   (length_past)                                                  
                        

        """
        self.there_is_change = True
        start0 = start_cc - 1   # convert to 0-based
        end0 = end_cc            # inclusive 1-based end == exclusive 0-based end

        pattern = self.sequence[start0:end0]
        new_sequence = AlterationFunctionsByIndex.delete_by_index(self, start_cc, end_cc)

        # Adjusts index_paste if the paste point was located after the deleted area.
        cut_length = end0 - start0
        if index_paste > start_cc:
            index_paste -= cut_length

        if no_return:
            AlterationFunctionsByIndex.insert(self, pattern, index_paste, length_paste, no_return=True)
            # Track the move mutation
            self._track_alteration(f"move:{start_cc}-{end_cc}->@{index_paste}")
        else:
            result = AlterationFunctionsByIndex.insert(self, pattern, index_paste, length_paste, no_return=False)
            # Track the move mutation
            self._track_alteration(f"move:{start_cc}-{end_cc}->@{index_paste}")
            return result

    def copy_past(self, 
                     start_cc: int,
                     end_cc: int, 
                     index_paste: int,
                     length_paste: str | int = 0, 
                     no_return: bool = True)-> genome | NoReturn:
        """
        Copy and paste a sequence.
        Example:
                        
                        COPY                                    PASTE
            -> ...atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcg...
                    |-----------|                      |---------------------|
                 start_cc     end_cc               index_paste   (length_past)                                                  
                        

        """
        self.there_is_change = True
        start0 = start_cc - 1
        end0 = end_cc

        pattern = self.sequence[start0:end0]
        if no_return:
            AlterationFunctionsByIndex.insert(self, pattern, index_paste, length_paste, no_return=True)
            # Track the copy‑paste mutation
            self._track_alteration(f"copy_paste:{start_cc}-{end_cc}@{index_paste}")
        else:
            result = AlterationFunctionsByIndex.insert(self, pattern, index_paste, length_paste, no_return=False)
            # Track the copy‑paste mutation
            self._track_alteration(f"copy_paste:{start_cc}-{end_cc}@{index_paste}")
            return result

class AlterationFunctionsByPattern(AlteredSequenceTrackerMixin):

    """
    This class provides functions that operate on ATCG sequences.
    The entire input sequence is processed by the functions.
    They return the new sequence.
    """

    def _pattern_to_regex(self, pattern: str) -> str:
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

    def replace(self,
                old: str,
                new: str,
                no_return: bool = True) -> genome | NoReturn:
        """Replace one nucleotide pattern with another.

        ``_`` matches exactly one ATCG base.
        ``%(n)`` matches any sequence of up to ``n`` ATCG bases.
        """
        self.there_is_change = True
        regex_pattern = self._pattern_to_regex(old)
        if no_return:
            self.altered_sequence = re.sub(regex_pattern, new, self.altered_sequence)
            # Track the replace mutation
            self._track_alteration(f"replace:{old}->{new}")
        else:
            return re.sub(regex_pattern, new, self.altered_sequence)

    def delete_by_pattern(self,
                           pattern: str,
                           no_return: bool = True) -> genome:
        """Delete a pattern from the sequence.

        ``_`` matches exactly one ATCG base.
        ``%(n)`` matches any sequence of up to ``n`` ATCG bases.
        """
        self.there_is_change = True
        regex_pattern = self._pattern_to_regex(pattern)
        if no_return:
            self.altered_sequence = re.sub(regex_pattern, "", self.altered_sequence)
            # Track the delete‑by‑pattern mutation
            self._track_alteration(f"delete_by_pattern:{pattern}")
        else:
            return re.sub(regex_pattern, "", self.altered_sequence)

class SequenceFactory:

    """
    Functions for generating sequences.
    """

    def repeat(self,
                pattern: str, nbr: int, 
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

    def merge(self, sequences: list[genome])-> genome:
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

    def proba_law(self, base: str, prob_mat: MutationMatrix) -> str:
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
    
    def mutate_independently(self, 
                     prob_mat: MutationMatrix, 
                     no_return: bool = True, 
                   )-> genome | NoReturn:
        """
        Apply the mutation probability matrix independently to each base.

        Example:

            If prob_mat[0][1] = 0.01, then an "A" has a 1% chance of becoming a "C".
        """
        self.there_is_change = True
        result = "".join(
            RandomAlterationFunctions.proba_law(base, prob_mat)
            for base in self.sequence
        )
        if no_return: self.altered_sequence = result
        else: return result

class WindowMutationFunctions:

    def enumerate_window_mutants(self,
                      start: int, end: int, step: int,
                      window: int = 3, 
                      only_different_bases: bool = True, 
                      max_char: int = 1_000_000,
                      return_muted_sequence: bool = True)-> dict[tuple[mut, ...], genome]:
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
        self.there_is_change = True
        output: dict[tuple[mut, ...], genome] = {}
        nbr_char = 0

        for i in range(start, end - window + 1, step):
            left_seq = self.sequence[:i]
            seq = self.sequence[i:i + window]
            right_seq = self.sequence[i + window:]

            # Iterate over every possible base combination (a, t, c, g), not just
            # the bases already present in the current window.
            mutant_sequences = itertools.product(GlobalVar.BASES, repeat=window)

            for p in mutant_sequences:
                perm = "".join(p)
                if (
                    all(seq[k] != perm[k] for k in range(len(perm)))  # Ensures that no base remains unchanged at its original position.
                    or (not only_different_bases)
                ):
                    new_sequence = left_seq + perm + right_seq if return_muted_sequence else ""
                    t_m = tuple_mutation(old=self.sequence, new=new_sequence)
                    output[t_m] = new_sequence
                    nbr_char += len(new_sequence) if return_muted_sequence else len(perm)

                    if nbr_char >= max_char:
                        return output

        return output

