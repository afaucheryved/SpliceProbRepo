#general importation
from spliceai.utils import one_hot_encode
import numpy as np
from functools import wraps
from keras.models import load_model
from pkg_resources import resource_filename
import time as t
import tensorflow as tf

#local importation
from app.schemas.typing import genome, mut

#scpliceia

def one_hot_encoder(dico_data: dict[str, genome], context: int =10000)->np.ndarray[np.float32]:
        """
        One-hot encode each sequence with flanking CONTEXT, then stack into a batch
        """
        padding = 'N' * (context // 2)
        for seq in dico_data.values():
            print(len(seq))

        def _prepare_sequence(seq: genome) -> genome:
            if len(seq) <= context:
                return seq + 'N'
            return seq

        encoded = [one_hot_encode(padding + _prepare_sequence(seq) + padding) for seq in dico_data.values()]
        x = np.stack(encoded, axis=0)  # shape: (batch_size, seq_len + context, 4)
        return x

def wrapp_calcul(calcul_function):
    @wraps(calcul_function)
    def wrapper(*args, **kwargs):
        print(f"\n---> START calculing {calcul_function.__name__}...\n")
        start = t.perf_counter()
        output = calcul_function(*args, **kwargs)
        end = t.perf_counter()
        print(f"\n---> END calculing {calcul_function.__name__} in {end-start:.4f} secondes\n")
        return output
    return wrapper

@wrapp_calcul
def calcul_y(dico_data: dict[str, genome], context: int = 10000, specified_models_used: set[int] | None = None)->np.ndarray:
    """
    Run prediction on the whole batch through each model and average
    calcul the y vector :
    y[a, b, c] --> a : batch number
                b : base position in the sequence
                c : [Acceptor Gain, Donor Gain, Acceptor Loss, Donor Loss]
    """
    x = one_hot_encoder(dico_data, context)
    if specified_models_used is None:
        paths = ('models/spliceai{}.h5'.format(x) for x in range(1, 6))
        #assert all(os.path.exists(n) for n in paths)
        models = [load_model(resource_filename('spliceai', x)) for x in paths]
        y = np.mean([m.predict(x, batch_size=len(dico_data)) for m in models], axis=0)[0]
    else:
        if all(n in [1,2,3,4,5] for n in specified_models_used):
            paths = ('models/spliceai{}.h5'.format(x) for x in specified_models_used)
            models = [load_model(resource_filename('spliceai', x)) for x in paths]
            y = np.mean([m.predict(x, batch_size=len(dico_data)) for m in models], axis=0)[0]
        else:
            raise ValueError("ERROR: specified_models_used only take this values : 1,2,3,4,5.")
    return y

# deduce_mutation

def tuple_mutation(old: genome, new: genome)->tuple[mut]:
    """
    deduces the tuple of mutations that were used to create the new sequence, 
    from the old one, with the notation of a mutation that is:
    ">p.A.B>C" : the base number A, which was a B become a C
    """
    if len(old) != len(new):
        raise ValueError("genomes must have the same length")

    return tuple(
        f">p.{i}.{b0}>{b1}"
        for i, (b0, b1) in enumerate(zip(old, new), start=1)
        if b0 != b1
    )

class SpliceAIModels(tf.keras.Model):
    """
    Represents a Keras model that returns the average of the specified SpliceAI models.
    Fully compatible with tf.GradientTape for gradient computation.
    We have to avoid using y_calcul() in order to track the gradient.
    """
    
    def __init__(self):
        super().__init__()
        models = {1, 2, 3, 4, 5}
        self.models_list = []
        
        for n in models:
            relative_path = f'models/spliceai{n}.h5'
            absolute_package_path = resource_filename('spliceai', relative_path)
            print(f"Loading SpliceAI model {n} from: {absolute_package_path}")
            
            model = tf.keras.models.load_model(absolute_package_path)
            self.models_list.append(model)
            
    def _one_hot_encoder(self, sequence: genome, context: int =10000) -> np.ndarray[np.float32]:
        """
        One-hot encode each sequence with flanking CONTEXT, then stack into a batch
        """
        padding = 'N' * (context // 2)
        prepared_sequence = sequence + 'N' if len(sequence) <= context else sequence
        encoded = one_hot_encode(padding + prepared_sequence + padding)
        x_batched = np.expand_dims(encoded, axis=0)
        return x_batched
    
    @wrapp_calcul
    def run(self, x_input: genome, models_used: set[int] | None = None, keep_gradiant=False):
        """
        The forward pass of TensorFlow (equivalent to forward() in PyTorch).
        x: A TensorFlow tensor representing the DNA sequence [Batch, Length, 4]
        """
        x = self._one_hot_encoder(x_input)
        valid_models = {1, 2, 3, 4, 5}
        
        models_used_id = {1, 2, 3, 4, 5} if models_used is None else models_used

        if not set(models_used_id).issubset(valid_models) and not models_used is None:
            raise ValueError("ERROR: models_used only takes values in {1, 2, 3, 4, 5} or None.")
        
        outputs = [
            model(x)
            for index, model in enumerate(self.models_list) 
            if index + 1 in models_used_id
            ] #only calculate mean with used models
        
        
        stacked_outputs = tf.stack(outputs, axis=0)
        y_mean = tf.reduce_mean(stacked_outputs, axis=0)
        
        if keep_gradiant:
            return y_mean
        else:
            return y_mean.numpy()