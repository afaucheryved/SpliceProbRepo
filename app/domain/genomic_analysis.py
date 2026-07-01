#general import
import numpy as np
import random as rd
import ruptures as rpt
import matplotlib.pyplot as plt
import tensorflow as tf
import os
from pkg_resources import resource_filename

#local import
from app.schemas.typing import mut
from app.schemas.typing import *
from app.services.general_services import GeneralServices as gs
from app.domain.sequence_functions import (AlterationFunctionsByIndex as afbi,
                                           WindowMutationFunctions as wmf)
from app.domain.calcul_function import Scoring
from app.test.global_var import GlobalVar
from app.schemas.general_schema import GeneticVariant

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
        non_altered_ref = gs.result_per_seqences(self, specified_models_used = specified_models_used)

        # try a random mutation on a base every 'step' bases.
        for base_i in range(0, 
                            len(self.sequence), 
                            step if step!=0 else 1):
            base_mutation = rd.choice([b for b in GlobalVar.BASES if b != self.sequence[base_i]]) # must change
            mutation = f">p.{base_i+1}.{self.sequence[base_i]}>{base_mutation}" # standart .fa file notation

            # deduce the corresponding genetic variant
            gv = GeneticVariant(
                name = "_", # useless here
                mutations = [mutation], # only one mutation
                sequence = self.sequence ,   
                altered_sequence = "_", #useless here
                )
            score_mutation = Scoring.mut(gs.return_proba_delta(gv, non_altered_ref, specified_models_used={5}), method="pondered", proba_simple=non_altered_ref)
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
        scored_mut = {}
        
        zona = self._zona(**kwargs)
        non_altered_ref = self.return_proba_simple()
        
        for interval in zona:
            mut_dict = wmf.enumerate_window_mutants(self, interval[0], interval[1]) # enumerate for each interval the list of all mutations to try
            
            for mut in mut_dict:
                
                proba_delta = gs.return_proba_delta(self, non_altered_ref, {1, 2, 3, 4, 5})
                mut_score = Scoring.mut(proba_delta, method = "pondered", non_altered_ref = non_altered_ref)
                
                scored_mut[mut] = mut_score
                
        return dict(sorted(scored_mut.items())) # simply returns the most significant mutations
                
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