#general importation
from spliceai.utils import one_hot_encode
import numpy as np
from functools import wraps
from keras.models import load_model
from pkg_resources import resource_filename
import time as t
import os

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
        encoded = [one_hot_encode(padding + seq + padding) for seq in dico_data.values()]
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