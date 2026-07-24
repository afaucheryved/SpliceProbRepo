#general import
import numpy as np
import random as rd
import ruptures as rpt
import matplotlib.pyplot as plt
import tensorflow as tf
import scipy.signal
from pkg_resources import resource_filename

#local import
from app.schemas.typing import mut
from app.schemas.typing import *
from app.services.general_services import GeneralServices as gs
from app.domain.sequence_functions import (AlterationFunctionsByIndex as afbi,
                                           WindowMutationFunctions as wmf)
from app.domain.calcul_function import IndependentScoring
from app.test.global_var import GlobalVar
from app.schemas.independant_gv_schema import IndependentGeneticVariant
from app.domain.initialization.initalize_my_model import my_model

class ImportanceSplicingSearch:
    """
    Have a function that identify the patterns and locations having the greatest impact on splicing probabilities changes.
    Returns a dictionary mapping each position to an importance score regarding the splicing process.
    Maybe too long. use gradient instead ?
    """
    def _zona(self, 
                step: int = 5,
                penality: int = 2,
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
        non_altered_ref = gs.result_per_sequences(self, specified_models_used = specified_models_used)

        # try a random mutation on a base every 'step' bases.
        for base_i in range(0, 
                            len(self.sequence), 
                            step if step!=0 else 1):
            base_mutation = rd.choice([b for b in GlobalVar.BASES if b != self.sequence[base_i]]) # must change
            mutation = f">p.{base_i+1}.{self.sequence[base_i]}>{base_mutation}" # standart .fa file notation

            # deduce the corresponding internal genetic variant
            # `IndependentGeneralServices` applies mutations onto
            # `altered_sequence` (not `sequence`), so it must start out as a
            # same-length copy of the base sequence -- a placeholder like "_"
            # made apply_mutations() index out of range on every call.
            tempo_gv = IndependentGeneticVariant(
                name = "_", # useless here
                mutations = [mutation], # only one mutation
                sequence = self.sequence ,
                altered_sequence = self.sequence,
                )
            score_mutation = IndependentScoring.mut(tempo_gv.return_proba_delta(specified_models_used={5}), method="pondered", proba_simple=non_altered_ref)
            mut_score.append(score_mutation)
        
        #--- in the case of a really short self.sequence
        #plt.plot(mut_score) # debug
        #plt.show()
        if len(mut_score) < 2:
            print("len(mut_score) < 2")
            if len(mut_score) == 1 and mut_score[0] > threshold / 100 * abs(mut_score[0]): # sup  sert à rien ?
                print("len(mut_score) == 1 and mut_score[0] > threshold / 100 * abs(mut_score[0])")
                return [[0, len(self.sequence) - 1]]
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
                real_end = min(b_end * step, len(self.sequence) - 1)
                intervals.append([real_start, real_end])
        print("__________________________")
        return intervals
        
    def pattern_in_zona(self, 
                        **kwargs) -> dict[set[mut], float] :
        """
        Uses 'enumerate_window_mutants' followed by 'calcul_y' and 'Scoring.mut', 
        to identify the patterns most significant for altering the splicing score within the previously identified regions of importance.
        """

        print("---------------------")
        print(self.__class__.__name__)
        print("---------------------")

        scored_mut = {}
        
        zona = self._zona(**kwargs)
        non_altered_ref = self.return_proba_simple()
        
        for interval in zona:
            mut_dict = wmf.enumerate_window_mutants(
                self,
                interval[0],
                interval[1],
                step=kwargs.get("step", 1),
            )

            for mut, mutated_sequence in mut_dict.items():
                tempo_gv = IndependentGeneticVariant(
                    name="_",
                    mutations=list(mut),
                    sequence=self.sequence,
                    altered_sequence=mutated_sequence,
                )
                proba_delta = tempo_gv.return_proba_delta(
                    non_altered_ref=non_altered_ref,
                    specified_models_used={1, 2, 3, 4, 5},
                )
                mut_score = IndependentScoring.mut(
                    proba_delta,
                    method="pondered",
                    proba_simple=non_altered_ref,
                )

                scored_mut[mut] = mut_score
                
        return dict(sorted(scored_mut.items())) # simply returns the most significant mutations
                
class SpotPositionFunctions: # à faire heriter à la classe internalgeneticvariant
    """
    The goal of the functions here is to deduce what mutation impact splicing probability of a gven base position.
    """
    def hight_impact_mutation_position(self, base: int, interval: list[int] | None = None,  models_used: set[int] = {1, 2, 3, 4, 5}, batch_size: int = 80)-> JSON:
        """
        INPUT :
            - base : the base tracked position, absolute within self.sequence.
            - interval : optional [start, end) sub-region of self.sequence to scan for
              mutations; base must fall within it.
            - self.sequence : the sequence we want to work with, containing the base we want to track.
        OUTPUT : {
            "donor" : list[  ]   --> list corresponding of the max mutations.

            "acceptor" : list[  ]   --> list corresponding of the max mutations.
        }

        return a list of float scoring the capacity of each position to impacte the tracked base splicing probability.
        One list for ech possible sequence.

        Example : 
        
        base=5, sequence="acgtacgtacgtacgt"


        splicing proba of the 5th base
            ^
            |
          0 |--------------------------  <-- A, C, G, T
            |         \   /
      -0.5  |           -  <-- C
            |________________________________________>
                        15                            mutation position

        This graph, ploted thanks the 4 lists returned by the function 'hight_impact_mutation_position', show that 
        mutate the 15th base into a C significatively reduce the splicing probability of the tracked base (here, the 5th)
        """

        if models_used is None:
            models_used = {1, 2, 3, 4, 5}

        if interval is not None:
            if not (interval[0] <= base < interval[1]):
                raise ValueError(
                    f"base {base} is out of range for interval [{interval[0]}, {interval[1]})"
                )
            sequence = self.sequence[interval[0]:interval[1]]
            local_base = base - interval[0]
        else:
            sequence = self.sequence
            local_base = base
        seq_len = len(sequence)

        def acgt(b_mut):
            mapping = {"A": 0, "C": 1, "G": 2, "T": 3}
            if b_mut in mapping:
                return mapping[b_mut]
            raise ValueError("Only ACGT is allowed")

        output = {
            "donor": [[0.0] * seq_len for _ in range(4)],
            "acceptor": [[0.0] * seq_len for _ in range(4)]
        }

        baseprob = my_model.get_single_base_score(sequence=sequence, position=local_base, models_used=models_used)

        mutations_to_batches: dict = {} # id : [sequence, from_base] --> the id is the position of the muted base.
        for id, b_o in enumerate(sequence):
            for b_mut in "ACGT":
                if b_mut != sequence[id]:

                    mut_seq = sequence[:id] + b_mut + sequence[id+1:]
                    mutations_to_batches[id] = [mut_seq, b_o]

        print("\n mutation_tasks done! \n") # loging

        for i in range(0, len(mutations_to_batches), batch_size):

            print(f"\n batch #{i//batch_size} / {len(mutations_to_batches)//batch_size + 1} runing...\n") # loging

            # batch creation
            batch = []
            for id in range(i, i+batch_size):
                if id < len(mutations_to_batches):
                    batch.append(mutations_to_batches[id][0])
            
            #run
            batch_probas = my_model.run_batches(batch, models_used=models_used)
            print(batch_probas[0][local_base][1])

            for idx, probas in enumerate(batch_probas):
                b_o = mutations_to_batches[i+idx][1]
                print(b_o)
                
                donor_value = probas[local_base][1] - baseprob[1]
                acceptor_value = probas[local_base][2] - baseprob[2]

                mut_idx = acgt(b_o)
                output["donor"][mut_idx][i+idx] = donor_value
                output["acceptor"][mut_idx][i+idx] = acceptor_value

        output_histo = {
            "donor": [
                max((nuc_list[i] for nuc_list in output["donor"]), key=abs) 
                for i in range(seq_len)
            ],
            "acceptor": [
                max((nuc_list[i] for nuc_list in output["acceptor"]), key=abs) 
                for i in range(seq_len)
            ]
        }
        return output_histo

    def spot_regulation_interval_peaks(self, mutation_json: dict[str, list[float]], prominence: float = 1e-6, min_width: float = 1.0) -> dict[str, list[tuple[int, int]]]:
        """
        Returns the intervals corresponding to the high impact mutation intervals.
        Uses scipy.signal.find_peaks library with prominence and width parameters.
        """
        output = {"acceptor": [], "donor": []}
        
        for key, axe_probs in mutation_json.items():

            signal = np.array(axe_probs)
            
            peaks, properties = scipy.signal.find_peaks(np.abs(signal), prominence=prominence, width=min_width)
            
            intervals = []
            if len(peaks) > 0:
                left_bounds = np.floor(properties["left_ips"]).astype(int)
                right_bounds = np.ceil(properties["right_ips"]).astype(int)

                for left, right in zip(left_bounds, right_bounds):
                    intervals.append((left, right))
            
            output[key] = intervals
            
        return output

    def rubber_window(self, exon: tuple[int, int], interval: tuple[int, int] | None = None, window_size: int = 5, models_used: tuple[int] | None = None, batch_size: int = 50, all_window_size: tuple[int, int] | None = None)-> JSON:

        """
        Mask sliding intervals of the sequence with 'N's -- the exon/intron boundary
        is not treated specially, a masked interval can straddle it or sit entirely
        inside the exon or an intron, exactly as if that boundary didn't exist -- and
        measure how each masking shifts the donor/acceptor splicing scores at the
        given exon's boundaries (exon[1] for the donor site, exon[0] for the acceptor
        site).

        Two mutually exclusive tiling modes:
          - default: non-overlapping windows of fixed length `window_size`, tiling
            the whole (sub)sequence from position 0.
          - all_window_size=(m, n): for every base position of the (sub)sequence,
            try every mask length p in [m, n] starting at that base, producing
            (n - m + 1) overlapping variants per base (e.g. m=1, n=8 gives 8
            variants per base).

        Returns a dict keyed by the (start, end) coordinates of the masked
        interval, each mapping to {"donor": float, "acceptor": float, "subsequence": str} :
        the delta of the donor/acceptor score at the exon boundaries caused by
        masking that interval, and the original bases it replaced.
        """
        #const
        sequence = self.sequence[interval[0] : interval[1]].upper() if interval is not None else self.sequence.upper()
        sequence_lenght = len(sequence)
        baseprob_donor = my_model.get_single_base_score(sequence=self.sequence, position=exon[1], models_used=models_used)[2]
        baseprob_acceptor = my_model.get_single_base_score(sequence=self.sequence, position=exon[0], models_used=models_used)[1]

        #var
        troncated_sequences: dict[tuple[int, int], str] = {}

        if all_window_size is not None:
            m, n = all_window_size
            for start in range(sequence_lenght):
                for p in range(m, n + 1):
                    end = min(start + p, sequence_lenght)
                    if end <= start:
                        continue
                    key = (start, end)
                    if key not in troncated_sequences: # skip redundant clamped duplicates
                        troncated_sequences[key] = sequence[:start] + "N" * (end - start) + sequence[end:]
        else:
            for start in range(0, sequence_lenght, window_size):
                end = min(start + window_size, sequence_lenght)
                troncated_sequences[(start, end)] = sequence[:start] + "N" * (end - start) + sequence[end:]

        print("\n ready to batch! \n")

        # batch
        window_scores: dict[tuple[int, int], dict] = {}
        windows = list(troncated_sequences.keys())
        for i in range(0, len(windows), batch_size):
            print(f"\n batch # {i//batch_size} / {len(windows)//batch_size +1}")
            batch_keys = windows[i:i+batch_size]
            batch = [troncated_sequences[key] for key in batch_keys]
            #proba run
            batch_probas = my_model.run_batches(batch, models_used=models_used)
            for key, value in zip(batch_keys, batch_probas):
                window_scores[key] = {
                    "donor": value[exon[1]][2] - baseprob_donor,
                    "acceptor": value[exon[0]][1] - baseprob_acceptor,
                    "subsequence": sequence[key[0]:key[1]],
                }

        return window_scores




## ---- ML POV ----

#this is a test 
""""""
class SpliceAIModels(tf.keras.Model):
    """
    Represents a Keras model that returns the average of the specified SpliceAI models.
    Fully compatible with tf.GradientTape for gradient computation.
    We have to avoid using y_calcul() in order to track the gradient.
    """
    def __init__(self, models_used: set[int] = {1, 2, 3, 4, 5}):
        super().__init__() # Initialize the parent tf.keras.Model class
        
        valid_models = {1, 2, 3, 4, 5}
        if not models_used.issubset(valid_models):
            raise ValueError("ERROR: models_used only takes values in {1, 2, 3, 4, 5}.")
        
        # In TensorFlow, a standard Python list is sufficient to store sub-models
        self.models_list = []
        
        for n in models_used:
            # 1. Replicate exactly how calcul_y finds the internal package files
            relative_path = f'models/spliceai{n}.h5'
            absolute_package_path = resource_filename('spliceai', relative_path)
            
            # 2. Load it natively into the list
            print(f"Loading SpliceAI model {n} from: {absolute_package_path}")
            model = tf.keras.models.load_model(absolute_package_path)
            self.models_list.append(model)

    def call(self, x):
        """
        The forward pass of TensorFlow (equivalent to forward() in PyTorch).
        x: A TensorFlow tensor representing the DNA self.sequence [Batch, Length, 4]
        """
        # Apply each model to the input x
        outputs = [model(x) for model in self.models_list]
        
        # Stack predictions (Dimension 0 = the models)
        stacked_outputs = tf.stack(outputs, axis=0)
        
        # Compute the average over the models dimension (axis=0)
        # Use tf.reduce_mean to preserve gradient traceability
        y_mean = tf.reduce_mean(stacked_outputs, axis=0)
        
        return y_mean

"""
def get_gradients(ensemble_model, input_self.sequence, position, site_type):
    """"""
    Computes the gradient of the targeted output with respect to the input self.sequence.
    site_type: 0 for Acceptor Gain, 1 for Donor Gain, 2 for Acceptor Loss, 3 for Donor Loss.
    site_type: here, only use 1 and 2
    """"""
    # Force TensorFlow to track operations on the DNA self.sequence
    self.sequence = tf.convert_to_tensor(input_self.sequence, dtype=tf.float32)
    with tf.GradientTape() as tape:
        tape.watch(self.sequence)
        
        # Global prediction: Shape [Batch, self.sequence_Length, 4]
        predictions = ensemble_model(self.sequence)
        
        # Extract the specific unique scalar score of the site of interest
        # Example: First element of the batch (0), at the desired position and site type
        target_score = predictions[0, position, site_type]
        
    # TensorFlow computes the derivative of target_score with respect to self.sequence
    gradients = tape.gradient(target_score, self.sequence)
    return gradients


def tf_integrated_gradients(ensemble_model, input_self.sequence, position, site_type, num_steps=100):
    """"""
    Implémentation vectorisée d'Integrated Gradients pour SpliceAI sous TensorFlow.
    Batch toutes les étapes d'interpolation en un seul passage GradientTape
    au lieu de num_steps+1 appels séquentiels.
    """"""
    input_self.sequence = tf.convert_to_tensor(input_self.sequence, dtype=tf.float32)

    # 1. Baseline neutre
    baseline = tf.zeros_like(input_self.sequence)

    # 2. Pas d'interpolation : shape [num_steps+1]
    alphas = tf.linspace(0.0, 1.0, num_steps + 1)

    # 3. Construire toutes les séquences interpolées en une seule fois
    # input_self.sequence: [1, L, 4] -> on retire la dim batch=1 pour la combiner avec alphas
    delta = input_self.sequence - baseline  # [1, L, 4]

    # reshape alphas pour le broadcasting : [num_steps+1, 1, 1, 1]
    alphas_reshaped = tf.reshape(alphas, (-1, 1, 1, 1))

    # baseline et delta répétés implicitement via broadcasting
    # résultat : [num_steps+1, 1, L, 4] -> on fusionne en [num_steps+1, L, 4]
    interpolated_inputs = baseline + alphas_reshaped * delta  # [num_steps+1, 1, L, 4]
    interpolated_inputs = tf.squeeze(interpolated_inputs, axis=1)  # [num_steps+1, L, 4]

    # 4. Calcul du gradient en un seul passage (batché)
    with tf.GradientTape() as tape:
        tape.watch(interpolated_inputs)
        predictions = ensemble_model(interpolated_inputs)  # [num_steps+1, L, 4]
        target_scores = predictions[:, position, site_type]  # [num_steps+1]

    # gradients shape : [num_steps+1, L, 4]
    gradients = tape.gradient(target_scores, interpolated_inputs)

    # 5. Moyenne des gradients (approximation de l'intégrale)
    mean_gradients = tf.reduce_mean(gradients, axis=0)  # [L, 4]

    # 6. Attribution finale = (input - baseline) * gradient moyen
    integrated_grads = tf.squeeze(delta, axis=0) * mean_gradients  # [L, 4]

    return integrated_grads.numpy()
"""