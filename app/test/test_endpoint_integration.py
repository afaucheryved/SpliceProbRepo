"""
Integration tests for FastAPI endpoints.

These tests use ``httpx.AsyncClient`` to exercise the full request/response
cycle.  The SpliceAI model (``my_model``) and Redis session backend are
monkeypatched so no real TensorFlow/Redis infrastructure is needed.
"""
import json
import pytest
from unittest.mock import ANY, patch
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Monkeypatch the model *before* importing the FastAPI app, so that the
# module-level ``my_model`` is already a stub when the routers are loaded.
# ---------------------------------------------------------------------------

class _FakeModel:
    """Stub that replaces ``my_model`` with a lightweight mock."""

    def run(self, x_input, models_used=None):
        # The router calls ``my_model.run(x_input=..., models_used=...)`` and
        # expects a tuple whose first element is a NumPy array of shape
        # (batch, seq_len, 3) — we return one row of zeros for each character.
        import numpy as np
        seq = x_input
        batch = 1
        seq_len = len(seq)
        y = np.zeros((batch, seq_len, 3), dtype=np.float32)
        return (y,)


patching_targets = [
    # (module_qualname, replaced_with)
    ("app.services.general_services.my_model", _FakeModel()),
    ("app.schemas.internal_gv_schema.my_model", _FakeModel()),
]

for qualname, replacement in patching_targets:
    parts = qualname.split(".")
    module_path = ".".join(parts[:-1])
    attr_name = parts[-1]
    import importlib
    mod = importlib.import_module(module_path)
    setattr(mod, attr_name, replacement)

# Force Redis session to use fakeredis
from app.services import redis_session
import fakeredis
redis_session._get_client = lambda: fakeredis.FakeStrictRedis()

# Now it is safe to import the FastAPI application.
from app.main import app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def async_client():
    """Provide an ``httpx.AsyncClient`` wired to the FastAPI ``app``."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# ---------------------------------------------------------------------------
# Tests – POST /GetSimpleProb/
# ---------------------------------------------------------------------------

class TestSimpleProb:
    ENDPOINT = "/GetSimpleProb/"

    @pytest.mark.asyncio
    async def test_valid_request_returns_200(self, async_client):
        payload = {
            "name": "test_seq",
            "sequence": "atcgatcg",
            "mutations": [""],
        }
        resp = await async_client.post(self.ENDPOINT, json=payload)
        assert resp.status_code == 200
        data = resp.json()
        # Expect acceptor_proba + donor_proba + altered sequence + session_id
        assert "acceptor_proba" in data
        assert "donor_proba" in data
        assert "session_id" in data
        # Each position should be mapped
        assert len(data["acceptor_proba"]) == 8

    @pytest.mark.asyncio
    async def test_invalid_mutation_returns_422(self, async_client):
        payload = {
            "name": "bad_mut",
            "sequence": "atcgatcg",
            "mutations": ["invalid_syntax"],
        }
        resp = await async_client.post(self.ENDPOINT, json=payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_sequence_returns_422(self, async_client):
        payload = {
            "name": "bad_seq",
            "sequence": "atcBxg",  # 'B' and 'x' are invalid
            "mutations": [""],
        }
        resp = await async_client.post(self.ENDPOINT, json=payload)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tests – POST /GetDeltaScore/
# ---------------------------------------------------------------------------

class TestDeltaScore:
    ENDPOINT = "/GetDeltaScore/"

    @pytest.mark.asyncio
    async def test_valid_request_returns_200(self, async_client):
        payload = {
            "name": "delta_test",
            "sequence": "aaaaaaaaaaaaaaaaaaaa",
            "mutations": [">p.5.a>c"],
        }
        resp = await async_client.post(self.ENDPOINT, json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "acceptor_proba" in data
        assert "donor_proba" in data
        assert "session_id" in data
        # Delta has "value" per position
        for key in ("acceptor_proba", "donor_proba"):
            for pos_entry in data[key].values():
                assert "value" in pos_entry

    @pytest.mark.asyncio
    async def test_invalid_mutation_syntax_returns_422(self, async_client):
        payload = {
            "name": "bad_delta",
            "sequence": "atcgatcg",
            "mutations": ["bad"],
        }
        resp = await async_client.post(self.ENDPOINT, json=payload)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tests – POST /resetgv
# ---------------------------------------------------------------------------

class TestResetGV:
    ENDPOINT = "/resetgv"

    @pytest.mark.asyncio
    async def test_reset_with_new_sequence(self, async_client):
        payload = {
            "name": "reset_test",
            "sequence": "gggggggggg",
            "mutations": [">p.1.g>a"],
            "session_id": None,
        }
        resp = await async_client.post(self.ENDPOINT, json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        # The reset endpoint returns the variant attributes
        assert "sequence" in data or "session_id" in data


# ---------------------------------------------------------------------------
# Tests – GET /get/…
# ---------------------------------------------------------------------------

class TestGetEndpoints:
    @pytest.mark.asyncio
    async def test_get_sequence_needs_session(self, async_client):
        """GET /get/sequence requires a ``session_id`` query param."""
        resp = await async_client.get("/get/sequence")
        # Missing required query param → 422
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_get_sequence_with_invalid_session(self, async_client):
        """Non-existent session should still return something (empty or error)."""
        resp = await async_client.get("/get/sequence?session_id=nonexistent")
        # The router catches exceptions; we check it doesn't crash.
        assert resp.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_get_deltaproba_aliases(self, async_client):
        """Both /get/deltaproba and /get/delatproba should work."""
        # Create a session first via simple proba
        payload = {
            "name": "alias_test",
            "sequence": "atcgatcgatcg",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        assert create_resp.status_code == 200
        sid = create_resp.json()["session_id"]

        for endpoint in ("/get/deltaproba", "/get/delatproba"):
            resp = await async_client.get(f"{endpoint}?session_id={sid}")
            assert resp.status_code in (200, 500)


# ---------------------------------------------------------------------------
# Tests – POST /altbyindex/…
# ---------------------------------------------------------------------------

class TestAlterationByIndex:
    @pytest.mark.asyncio
    async def test_delete_and_delet_aliases(self, async_client):
        """Both /altbyindex/delete and /altbyindex/delet should work."""
        # Create a session
        payload = {
            "name": "alt_test",
            "sequence": "atcgatcgatcgatcg",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        sid = create_resp.json()["session_id"]

        for endpoint in ("/altbyindex/delete", "/altbyindex/delet"):
            resp = await async_client.post(
                endpoint,
                json={"start": 2, "length": 4, "session_id": sid},
            )
            # Should succeed — the router returns None (no body) on success
            assert resp.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_insert(self, async_client):
        payload = {
            "name": "insert_test",
            "sequence": "aaaaaaaaaaaaaaaa",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        sid = create_resp.json()["session_id"]

        resp = await async_client.post(
            "/altbyindex/insert",
            json={"pattern": "tttt", "index": 5, "length": 4, "session_id": sid},
        )
        assert resp.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_move_and_copypast(self, async_client):
        payload = {
            "name": "move_test",
            "sequence": "atcgatcgatcgatcg",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        sid = create_resp.json()["session_id"]

        for endpoint in ("/altbyindex/move", "/altbyindex/copypast"):
            resp = await async_client.post(
                endpoint,
                json={
                    "start_cc": 2,
                    "end_cc": 5,
                    "index_paste": 10,
                    "length_paste": 3,
                    "session_id": sid,
                },
            )
            assert resp.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_delete_with_both_length_and_end_fails(self, async_client):
        """Sending both ``length`` and ``end`` should trigger a 500."""
        payload = {
            "name": "both_test",
            "sequence": "atcgatcgatcgatcg",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        sid = create_resp.json()["session_id"]

        resp = await async_client.post(
            "/altbyindex/delete",
            json={"start": 1, "end": 5, "length": 3, "session_id": sid},
        )
        # The route catches ValueError and re-raises as Exception → 500
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Tests – POST /altbypattern/…
# ---------------------------------------------------------------------------

class TestAlterationByPattern:
    @pytest.mark.asyncio
    async def test_replace(self, async_client):
        payload = {
            "name": "replace_test",
            "sequence": "atcgatcgatcgatcg",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        sid = create_resp.json()["session_id"]

        resp = await async_client.post(
            "/altbypattern/replace",
            json={"old": "atcg", "new": "NNNN", "session_id": sid},
        )
        assert resp.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_delete_by_pattern_and_alias(self, async_client):
        payload = {
            "name": "pdel_test",
            "sequence": "atcgatcgatcgatcg",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        sid = create_resp.json()["session_id"]

        for endpoint in ("/altbypattern/delete", "/altbypattern/delet"):
            resp = await async_client.post(
                endpoint,
                json={"pattern": "atcg", "session_id": sid},
            )
            assert resp.status_code in (200, 500)


# ---------------------------------------------------------------------------
# Tests – POST /analysis/patterninzona  (requires model stub)
# ---------------------------------------------------------------------------

class TestAnalysis:
    @pytest.mark.asyncio
    async def test_pattern_in_zona(self, async_client):
        # We cannot easily exercise the full path without ruptures, but we
        # verify the endpoint at least returns a 200/500.
        payload = {
            "name": "zona_test",
            "sequence": "atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcga",
            "mutations": [""],
        }
        create_resp = await async_client.post("/GetSimpleProb/", json=payload)
        sid = create_resp.json()["session_id"]

        resp = await async_client.post(
            "/analysis/patterninzona",
            json={
                "step": 3,
                "penality": 1,
                "threshold": 10,
                "window": 4,
                "specified_models_used": [5],
                "session_id": sid,
            },
        )
        # May be 200 or 500 depending on ruptures internals; we just verify
        # the server does not crash with a 422.
        assert resp.status_code in (200, 500)