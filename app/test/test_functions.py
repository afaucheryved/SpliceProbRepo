
#global import
from functools import wraps
from matplotlib.patches import Patch
import tensorflow as tf
import functools
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
import json
import inspect

matplotlib.use('TkAgg') #to see the graph

#local import
from app.domain.sequence_functions import WindowMutationFunctions
from app.domain.genomic_analysis import ImportanceSplicingSearch as iss
from app.domain.genomic_analysis import ImportanceSplicingSearch, SpotPositionFunctions
from app.domain.spliceai_calculation import one_hot_encoder
from app.domain.initialization.initalize_my_model import my_model
from app.domain.initialization.initialize_internal_gv import my_internal_genetic_variant
from app.test.global_var import parameters_1_1, parameters_1_2, parameters_3, parameters_2, parameters_3_juste, parameters_test_1, parameter_test_sequ3

#test tools
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

def plot_mutation_importance(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # 1. Lecture optimisée du fichier JSON
        with open("app/test/output_gradiant.json", "r") as file:
            payload = json.load(file) # Charge le flux directement
            
        # 2. Reconstitution instantanée de la matrice NumPy
        # On force en float32 pour économiser 50% de RAM sur les gros volumes

        raw_output = np.array(payload["data"], dtype=np.float32)
        
        # 3. Nettoyage des dimensions (identique à ton code d'origine)
        matrix = np.squeeze(raw_output)
        
        if len(matrix.shape) != 2 or matrix.shape[1] != 4:
            raise ValueError(f"La matrice doit avoir une forme finale (N, 4). Forme reçue : {matrix.shape}")
        
        limit = 1e-8
        matrix = np.where(np.abs(matrix) > limit, matrix, 0.0)
        
        seq_len = matrix.shape[0]
        positions = np.arange(seq_len)
        
        # Ordre classique des bases (à adapter selon ton one_hot_encoder)
        bases = ['A', 'C', 'G', 'T']
        colors = {
            'A': '#22c55e', # Vert
            'C': '#2563eb', # Bleu
            'G': '#eab308', # Jaune
            'T': '#dc2626'  # Rouge
        }
        
        # Separer les valeurs positives et négatives
        pos_matrix = np.where(matrix > 0, matrix, 0)
        neg_matrix = np.where(matrix < 0, matrix, 0) # Contient des valeurs négatives
        
        # Initialisation de la figure
        #plt.figure(figsize=(max(10, seq_len * 0.2), 6))
        largeur_securisee = min(30, max(10, seq_len * 0.2))
        plt.figure(figsize=(largeur_securisee, 6))
        
        # --- PARTIE POSITIVE (Empilée vers le haut) ---
        bottom_pos = np.zeros(seq_len)
        for i, base in enumerate(bases):
            values = pos_matrix[:, i]
            plt.bar(positions, values, bottom=bottom_pos, color=colors[base], label=f'{base} (+)')
            bottom_pos += values
            
        # --- PARTIE NÉGATIVE (Empilée vers le bas) ---
        bottom_neg = np.zeros(seq_len)
        for i, base in enumerate(bases):
            values = neg_matrix[:, i] # Valeurs négatives
            plt.bar(positions, values, bottom=bottom_neg, color=colors[base])
            bottom_neg += values # On ajoute un nombre négatif, donc ça descend bien
            
        # Customisation du graphique
        plt.axhline(0, color='black', linewidth=0.8, linestyle='--')
        plt.xlabel("Position dans la séquence (Nucléotides)")
        plt.ylabel("Importance des Mutations (Score de Gradient)")
        plt.title("Cartographie d'Importance des Mutations (Integrated Gradients)")
        
        # Légende unique pour les 4 couleurs
        legend_elements = [Patch(facecolor=colors[b], label=b) for b in bases]
        plt.legend(handles=legend_elements, loc='upper right')
        
        plt.tight_layout()
        plt.show()
        
    return wrapper

def write_in_json(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        output = func(*args, **kwargs)
        if isinstance(output, np.ndarray):
            data_to_save = {"data": output.tolist()}
        else:
            data_to_save = {"data": output}
        with open("app/test/output_gradiant.json", "w") as file:
            json.dump(data_to_save, file)

        return output
    return wrapper

def read_json_file(path):
    with open(path, "r") as file:
        return json.load(file)

def plot_hight_impact_mutation_position(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        output = func(*args, **kwargs)
        
        colors = {
            'up': '#22c55e',       # green
            'down': '#dc2626',     # red
            'bg_intervals': "#62c0ff" # background color to show the intervals
        }

        fig, axes = plt.subplots(2, 1, figsize=(12, 8), sharex=True)

        intervals = my_internal_genetic_variant.spot_regulation_interval_peaks(output)
        print("Intervalles détectés :", intervals)

        for ax, region in zip(axes, ["donor", "acceptor"]):
            region_intervals = intervals.get(region, [])
            for start, end in region_intervals:
                ax.axvspan(start, end, facecolor=colors['bg_intervals'], alpha=0.3, zorder=0)

            values = np.array(output[region])
            positions = np.arange(len(values))
            bar_colors = [colors['up'] if v > 0 else colors['down'] for v in values]

            ax.bar(positions, values, color=bar_colors, width=1.0, zorder=2)

            ax.axhline(0, color='black', linewidth=0.8, linestyle='--', zorder=3)
            ax.set_ylabel(f"{region.capitalize()} score delta")

            legend_elements = [
                Patch(facecolor=colors['up'], label='Augmente l\'épissage'),
                Patch(facecolor=colors['down'], label='Réduit l\'épissage'),
                Patch(facecolor=colors['bg_intervals'], alpha=0.3, label='Intervalles d\'intérêt')
            ]
            ax.legend(handles=legend_elements, loc='upper right')

        axes[-1].set_xlabel("Position mutée dans la séquence")
        fig.suptitle("Impact des mutations par position sur la probabilité d'épissage")
        plt.tight_layout()
        plt.show()

        return output
    return wrapper

def plot_rubber_window(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        output = func(*args, **kwargs)

        colors = {
            'up': '#22c55e',      # green
            'down': '#dc2626',    # red
            'neutral': '#9ca3af', # gray, for zero/undetermined windows
        }
        print(args, kwargs)
        exon = kwargs.get("exon", None)
        windows = sorted(output.keys(), key=lambda w: w[0])
        positions = [w[0] for w in windows]

        for region, idx in [("donor", 1), ("acceptor", 0)]:
            values = np.array([output[w][idx] for w in windows], dtype=float)
            bar_colors = [
                colors['up'] if v > 0 else colors['down'] if v < 0 else colors['neutral']
                for v in values
            ]

            plt.figure(figsize=(12, 4))
            plt.bar(positions, values, color=bar_colors, width=1.0)
            plt.axhline(0, color='black', linewidth=0.8, linestyle='--')
            plt.axvline(exon[0], color='#2563eb', linestyle=':', linewidth=1.5, label='Exon start')
            plt.axvline(exon[1], color='#2563eb', linestyle=':', linewidth=1.5, label='Exon end')
            plt.xlabel("Position dans la séquence")
            plt.ylabel(f"{region.capitalize()} score delta")
            plt.title(f"Rubber window - impact sur le site {region}")

            legend_elements = [
                Patch(facecolor=colors['up'], label='Augmente l\'épissage'),
                Patch(facecolor=colors['down'], label='Réduit l\'épissage'),
                Patch(facecolor=colors['neutral'], label='Non déterminé'),
            ]
            plt.legend(handles=legend_elements, loc='upper right')
            plt.tight_layout()

        plt.show()
        return output
    return wrapper

def write_in_file(func):
    sig = inspect.signature(func)

    @wraps(func)
    def wrapper(*args, **kwargs):
        #write each elements retuned in the rubber_window_dictionnary in lines, in order to get it in a dictionnary after.
        # example for one line:
        # (2532, 2536): {'donor': np.float32(-0.004984051), 'acceptor': np.float32(6.312132e-05), 'subsequence': 'GATC'}
        output = func(*args, **kwargs)

        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        sequence = bound.arguments["sequence"]
        exon = bound.arguments["exon"]

        path = "app/test/output/output_rubber_window.txt"

        with open(path, "w") as file:
            file.write(f"{len(sequence)}\n")
            file.write(f"exon: ({exon[0]}, {exon[1]})\n")
            for key, value in output.items():
                file.write(f"{key}: {value}\n")

        return output
    return wrapper


# test

#@write_in_file
def test_rubber_window(sequence, exon, batch_size, all_window_size, first_search_window_size, first_search_step):
    my_internal_genetic_variant.sequence = sequence
    print("sequence lenght", len(sequence))
    return my_internal_genetic_variant.rubber_window(exon=exon, batch_size=batch_size, all_window_size=all_window_size, first_search_window_size=first_search_window_size, first_search_step=first_search_step) # (897, 947) or (31, 102) or (7300, 7371)

print(test_rubber_window(**parameters_test_1))

