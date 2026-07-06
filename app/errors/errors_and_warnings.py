
class InvalidMutationSyntax(Exception):
    """a mutation do not corespond to the following syntax : >p._._>_"""
    
class NotItalisedInternalGeneticVariant(Warning):
    """
    You are getting a 'Internal Genetic Variant' instance with an empty sequence statoic field.
    Please use '/resetgv' endpoint to initialise it first.
    """
    
class CurrentBaseToMutateDoesntMach(Warning):
    """
    There is some bases you want to mutate are not the ones you expected.
    example : you want change X to Y but Z was found insted of X.
    Mutations implemented nonetheless.
    """
