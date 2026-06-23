#global import
from functools import wraps
import matplotlib.pyplot as plt
import ruptures as rpt

#local import
from app.domain.sequence_functions import WindowMutationFunctions
from app.domain.genomic_analysis import ImportanceSplicingSearch as iss

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

sequence = """
   320761 ttccattaaa gaaagtatct cccatccaag cgataccgaa aatagcaaca actgctgttg
   320821 ctcctgcttt aaagacgtta ccagacacaa tgctttctac atttggttta cagaaaataa
   320881 taataagagc cgcgatagtt aacataacca tctcaattgt gttcggcatg gaaagacggg
   320941 ctaacttccc atcaactatc catcctggac gaagtgcttc aaatgaacca agaagtacaa
   321001 caaggaaggt tcctacaagg aaaaggataa ctgataattt ggcgcccttt acacctacaa
   321061 attctttttt ctcttcaagc ttaggaatca ttccttcttt taatcgtttt aagtattcag
   321121 ggtcttcatt taattctttt cccatcttac tagcaacgaa tgctgctaac atacaagcaa
   321181 tgaaagtaga aggaatactc acttttaaaa tatctaataa agtgatttta tagtcagcta
   321241 acattgctaa aagagcaact gtggcagctg aaattgggct agctgtaatt gcttgttgag
   321301 aagcgattac ggcaatcgac attgggcgtt ccggtctaat ccctgattca cgagagactt
   321361 ctgcaataac aggaagtaca gaataggcaa cgtgaccagt acctgcacat agtgtgaata
   321421 aataagtaac aattggagca aaaaaagtaa tacgctttgg attttttcgt aatgcctttt
   321481 cagctagatg aacaagatag tccattcctc cagcagcttg caaagcacca gcagcagtaa
   321541 ttactgccaa aatcataagc attacatcga taggaggcgc ggtcggttgt aagtggaaga
   321601 caaaaacgag tattgccata ccaactccac ccattactcc taaaccaact ccgcctaggc
   321661 gtgcaccaat aaaaatacag agtaacaagg taagaaattg tagccaaaac atgataaact
   321721 acctccgaaa ttcattagtt aagatatatt cgaatagttt aatttgaatg aaaattaaat
   321781 aaatacccga agaaatcctt gttatttata cattttttat tatataacac aaaaaaagta
   321841 acattcacgt actttttgaa attatttcga aaaagcaatg cgttaaaaat ttgtatttat
   321901 atctctaaat aagtagacat tttgatttat atgttgtaat ctttgaaaga gaataaatta
   321961 attctcatag aactcccata tcgttcaact cgttcagcga gaaaggcaaa ctgatggaaa
   322021 catgaggacg caaaactaca ggagctaagg tcgaaaggct atgctagcca gttaccggac
   322081 ggatagggtt ggtcttggcc aatgctttta cattggcttt tttttattct cgaatatatt
   322141 gagaatcatt ttcaaacaaa atattcgtat attttgtttt tttgttatgt taattaagga
   322201 aggtggatat taatgaaaaa atattggcat aagttatcgt tccttcaaaa gaacgtctta
   322261 ttaactgtat tagttatttt gacacttgtt ggaagtatgg gtgcgttaag tttcaacatg
   322321 tttcaaaata gtatgatgtc tttatttgaa aggcagtcta ttgaaacagg agaaatagta
   322381 ttgaaaaaat tggatgtaga attagttaga gacatggcga aagatcctac agccgaaaaa
   322441 gtgaaaaaag aaaagttaac agagaaatta gatgaagtgt caaaagaatt gaaaagtgtt
   322501 ggacaaacgt atgttacagg agcaaagccg aatgaaaagc gagaattaca actcgttggt
   322561 ttgactacag agttaacaaa tgcattccct ataaagccgg gagattatta tgaacaaccc
   322621 gctcattgga tgaaggcata cgataaggtc attgatacga aaaaggccca aatgacagaa
   322681 gtatatgaag atgaaatagg ttcgtgggtg acaatattag aaccaattac agatggagaa
   322741 aacaatattg ttgcaattat tgcggctgac ttagatgctt ccattgttcc tattacaaaa
   322801 gagaagttta tgatacaggg cttactcttt atcattattt cattagcaat tgcgactatt
   322861 actcaattct ttatcgtgcg tcactcgcta gctccattaa aagatttacg agaaggatta
   322921 cgtaaaattg gtgaaggtga tttaagtatt aaattaaaag aaagaccaga tgatattgga
   322981 attattaatg tttatttcaa taacacgatt gaaaaattta aagggattat agataaagta
   323041 aggcaaactg ctgagcaagt ttcttcttct tcacaagaat tgtcggcgag tacagaggaa
   323101 aacagtatgg cagttcaaga gattgcaagt tctattgaag gtttaagagt aggggcacag
   323161 tctcaaaaaa cttcagtaca acaatgttta ggaattgtac atggaatgga agataaggta
   323221 gaagagataa ctggggctgc aaaacaagtt gcggttgctt ctgaaggtat ggagcaacat
   323281 tcaattgaag gtaatgaagt gattggacaa attattaatc aaatgagttt aatccaaaat
"""
# function test

def function_test():
    return iss._zona(clean_string(sequence), 10, 5, 1)

#print(function_test())
print(clean_string(sequence))
