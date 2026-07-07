# Stub module for legacy singleton pattern.
# The 4 legacy routers (get_router, resetgv_router, analysis_router, alteration_radom)
# still import `my_internal_genetic_variant` from here.
# TODO: Migrate these routers to the session-based factory pattern.
from app.schemas.internal_gv_schema import InternalGeneticVariant

my_internal_genetic_variant = InternalGeneticVariant()

print("\ninitialisation my_internal_genetic_variant completed !\n")