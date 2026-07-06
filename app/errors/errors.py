
class InvalidMutationSyntax(Exception):
    """a mutation do not corespond to the following syntax : >p._._>_"""
    
class NotnitalisedInternalGeneticVariant(Warning):
    """
    You are getting a 'Internal Genetic Variant' instance with an empty sequence statoic field.
    Please use '/resetgv' endpoint to initialise it first.
    """