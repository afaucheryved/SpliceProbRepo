import time
import requests
from fastapi import APIRouter
from pydantic import BaseModel

from app.domain.internal_gv_factory import create_internal_variant

router = APIRouter()


class EnsemblGetParams(BaseModel):
    session_id: str | None = None
    ensembl_id: str


_TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}


def _fetch_ensembl_sequence(ensembl_id: str) -> str:
    server = "https://rest.ensembl.org"
    ext = f"/sequence/id/{ensembl_id}?"

    max_attempts = 3
    backoff_seconds = 1.0
    for attempt in range(1, max_attempts + 1):
        r = requests.get(
            server + ext,
            headers={"Content-Type": "text/plain"},
        )

        if r.ok:
            return r.text

        if r.status_code not in _TRANSIENT_STATUS_CODES or attempt == max_attempts:
            r.raise_for_status()

        time.sleep(float(r.headers.get("Retry-After", backoff_seconds)))
        backoff_seconds *= 2

    r.raise_for_status()


@router.post("/get")
async def get_ensembl_sequence(p: EnsemblGetParams):
    try:
        sequence = _fetch_ensembl_sequence(p.ensembl_id)

        gv = create_internal_variant(
            sequence=sequence,
            mutations=[],
            session_id=p.session_id,
        )

        gv.name = p.ensembl_id
        gv.proba_simple = gv.return_proba_simple()
        gv.proba_delta = gv.return_proba_delta()

        print(f"INFO : sequence loaded ! : session_id = {gv.session_id}")
        return {"session_id": gv.session_id, "status": "new_sequence_from_ensembl"}
    except Exception as e:
        raise Exception(f"Fail to get and load ensembl sequence to Internal Genetic Variant : {e}")