#global importation
from fastapi import FastAPI

#local importation :
from app.router.delta_router import router as delta_router
from app.router.simple_router import router as simple_router
from app.router.alteration_byindex_router import router as alteration_byindex_router
from app.router.alteration_bypattern_router import router as alteration_bypattern_router
from app.router.analysis_router import router as analysis_router
from app.router.alteration_radom import router as alteration_radom_router
from app.router.get_router import router as get_router
from app.router.resetgv_router import router as resetgv_router
from app.router.ws_rubber_window import router as ws_rubber_window_router
from app.router.ensembl_router import router as ensembl_router

"""
documentation interactive : http://127.0.0.1:8000/docs
to run this file : fastapi  dev app/main.py
"""


app = FastAPI()


app.include_router(delta_router)
app.include_router(simple_router)
app.include_router(resetgv_router)
app.include_router(get_router,
                  prefix="/get")
app.include_router(alteration_byindex_router, 
                   prefix="/altbyindex")
app.include_router(alteration_bypattern_router,
                   prefix="/altbypattern")
app.include_router(alteration_radom_router)
app.include_router(analysis_router,
                   prefix="/analysis")
app.include_router(ensembl_router,
                    prefix="/ensembl")
app.include_router(ws_rubber_window_router)
