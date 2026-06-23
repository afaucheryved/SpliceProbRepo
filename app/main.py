#global importation
from fastapi import FastAPI

#local importation :
from app.router.delta_router import router as delta_router
from app.router.simple_router import router as simple_router

"""
documentation interactive : http://127.0.0.1:8000/docs
to run this file : fastapi  dev app/main.py
"""

app = FastAPI()

app.include_router(delta_router)
app.include_router(simple_router)