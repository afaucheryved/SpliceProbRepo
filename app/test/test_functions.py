
#global import
from functools import wraps
from matplotlib.patches import Patch
import tensorflow as tf
import functools
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
import json
import sys

matplotlib.use('TkAgg') #to see the graph

#local import
from app.domain.sequence_functions import WindowMutationFunctions
from app.domain.genomic_analysis import ImportanceSplicingSearch as iss
from app.domain.genomic_analysis import ImportanceSplicingSearch
from app.domain.spliceia_calculation import one_hot_encoder
from app.domain.initalize_my_model import my_model
from app.domain.initialize_internal_gv import my_internal_genetic_variant

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
# var test

sequence = "agttgccaagggagcatatggcaaataattaatgacagtttgctatggcctttctcatagAacatactccatctggccttccgctgctttatcagggtcatctaattatttaggaaatgcAagcagcttcccttagatggcacgttggtggtagctgtatgtgtctgtggggtgtccaggcctgaaacatcaagacccatgacttatcatttgaatagatgtggtacacagtggcagatatagaccccctcatgtccacacaggctttcgtgtgtgctaactccctcgtgcactggaacgcggtaatttcctgtgcttctttccagATCGTGCACAGAACTCTGGCGGCCATGCTGGGTTCCCTTGCAGCACTGGCAGCACTGGCTGTGATTGGCGATgtaagttgtcacagtcccaatccctggcttaccactcagtgggatgtcagctcaaagatgttccaggattcaggctttcgctGgttttttcactattttatatgccacgtccatgtttttgcccaagaaccatgctagaggtAtgaactaacaagctacagcattgaagagtacttttcattaggttttgtcacacactcacAtcccagtggtgtgattcctcatcgtggtggaggaaaggctcctcatgggcatgtttgccTagggctgtggagctgggttgtgatggggctggatctgggtgttggaactagaggggaccGtcctagctggtgcagaaaggtgggagtcagttgggccagggtctgtcctgaagagatcaggaggcccctggagaggcgtgtttggggatgagggtgtcctgtttgg"

input_sequence = one_hot_encoder({"genom": sequence})

my_internal_genetic_variant.insert("acgt", 0, 0)
# function test zone

print(my_internal_genetic_variant.sequence)