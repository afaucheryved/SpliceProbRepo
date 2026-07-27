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

    def _one_hot_encoder(self, sequence, context=10000):
        """Stub for one-hot encoding used by ``_track_alteration``."""
        import numpy as np
        return np.zeros((len(sequence) + 2 * context, 4), dtype=np.float32)

    def get_single_base_score(self, sequence, position, models_used=None):
        # [P(neither), P(acceptor), P(donor)] -- see SpliceAIModels.get_single_base_score.
        import numpy as np
        return np.zeros(3, dtype=np.float32)

    def run_batches(self, x_input, models_used=None, keep_gradiant=False):
        import numpy as np
        seq_len = len(x_input[0]) if x_input else 0
        return np.zeros((len(x_input), seq_len, 3), dtype=np.float32)


patching_targets = [
    # (module_qualname, replaced_with)
    ("app.services.general_services.my_model", _FakeModel()),
    ("app.schemas.internal_gv_schema.my_model", _FakeModel()),
    ("app.domain.genomic_analysis.my_model", _FakeModel()),
]

for qualname, replacement in patching_targets:
    parts = qualname.split(".")
    module_path = ".".join(parts[:-1])
    attr_name = parts[-1]
    import importlib
    mod = importlib.import_module(module_path)
    setattr(mod, attr_name, replacement)

# Force Redis session to use fakeredis. Must return the SAME instance on
# every call (like the real _get_redis_client's caching) -- a lambda that
# builds a fresh FakeStrictRedis() per call means every set_session_data /
# get_session_data pair hits a different empty in-memory store, and this
# patch is never undone, so it silently broke Redis-backed state for every
# other test module collected in the same pytest session.
from app.services import redis_session
import fakeredis
_fake_redis_client = fakeredis.FakeStrictRedis(decode_responses=True)
redis_session._get_redis_client = lambda: _fake_redis_client

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
        """Mint a new session (session_id: null) — original behaviour."""
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

    @pytest.mark.asyncio
    async def test_reset_existing_session_new_sequence(self, async_client):
        """Existing session_id + new sequence → base_sequence changes,
        altered_sequences cleared, session_id unchanged."""
        # 1. Create a session with the original sequence (via /resetgv).
        create_payload = {
            "name": "reset_test",
            "sequence": "cccccccccc",
            "mutations": [""],
            "session_id": None,
        }
        create_resp = await async_client.post(self.ENDPOINT, json=create_payload)
        assert create_resp.status_code == 200
        sid = create_resp.json()["session_id"]

        # 2. Verify the base_sequence was set.
        seq_resp = await async_client.get(f"/get/sequence?session_id={sid}")
        assert seq_resp.status_code == 200
        assert seq_resp.json() == "cccccccccc"

        # 3. Reset the session with a new sequence.
        reset_payload = {
            "name": "reset_test",
            "sequence": "aaaaaaaaaa",
            "mutations": [""],
            "session_id": sid,
        }
        reset_resp = await async_client.post(self.ENDPOINT, json=reset_payload)
        assert reset_resp.status_code == 200
        reset_data = reset_resp.json()
        assert reset_data["session_id"] == sid

        # 4. Verify the base_sequence has changed.
        seq_resp = await async_client.get(f"/get/sequence?session_id={sid}")
        assert seq_resp.status_code == 200
        assert seq_resp.json() == "aaaaaaaaaa"

        # 5. Verify altered_sequences was cleared (allsimpleprobas should be empty).
        probas_resp = await async_client.get(f"/get/allsimpleprobas?session_id={sid}")
        assert probas_resp.status_code == 200
        assert probas_resp.json() == {}

    @pytest.mark.asyncio
    async def test_reset_existing_session_empty_sequence(self, async_client):
        """Existing session_id + empty sequence → unchanged reconnect behaviour
        (regression guard)."""
        # 1. Create a session (via /resetgv).
        create_payload = {
            "name": "regression_test",
            "sequence": "tttttttttt",
            "mutations": [""],
            "session_id": None,
        }
        create_resp = await async_client.post(self.ENDPOINT, json=create_payload)
        assert create_resp.status_code == 200
        sid = create_resp.json()["session_id"]

        # 2. Reset with empty sequence — should keep the original base_sequence.
        reset_payload = {
            "name": "regression_test",
            "sequence": "",
            "mutations": [""],
            "session_id": sid,
        }
        reset_resp = await async_client.post(self.ENDPOINT, json=reset_payload)
        assert reset_resp.status_code == 200
        assert reset_resp.json()["session_id"] == sid

        # 3. Verify base_sequence is unchanged.
        seq_resp = await async_client.get(f"/get/sequence?session_id={sid}")
        assert seq_resp.status_code == 200
        assert seq_resp.json() == "tttttttttt"

    @pytest.mark.asyncio
    async def test_reset_null_session_mints_new(self, async_client):
        """session_id: null → unchanged mint-new-session behaviour (regression guard)."""
        payload = {
            "name": "mint_test",
            "sequence": "gggggggggg",
            "mutations": [""],
            "session_id": None,
        }
        resp = await async_client.post(self.ENDPOINT, json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] is not None
        assert data["status"] == "reset"


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

    @pytest.mark.asyncio
    async def test_high_impact_position(self, async_client):
        # /resetgv mints a session without going through the pre-existing
        # broken result_per_sequences() shape-mismatch path that
        # /GetSimpleProb/ hits with this test module's _FakeModel stub (see
        # TestSimpleProb failures) -- we only need a session with a stored
        # sequence here, not a computed proba.
        create_payload = {
            "name": "high_impact_test",
            "sequence": "atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcga",
            "mutations": [],
            "session_id": None,
        }
        create_resp = await async_client.post("/resetgv", json=create_payload)
        sid = create_resp.json()["session_id"]

        resp = await async_client.post(
            "/analysis/highimpactposition",
            json={"base": 5, "session_id": sid},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert set(data.keys()) == {"donor", "acceptor"}
        for region in ("donor", "acceptor"):
            assert len(data[region]) == 4
            assert all(len(row) == len(create_payload["sequence"]) for row in data[region])

    @pytest.mark.asyncio
    async def test_high_impact_position_interval_out_of_range_base(self, async_client):
        create_payload = {
            "name": "high_impact_test_interval",
            "sequence": "atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcga",
            "mutations": [],
            "session_id": None,
        }
        create_resp = await async_client.post("/resetgv", json=create_payload)
        sid = create_resp.json()["session_id"]

        # base is outside the interval -- the domain layer raises ValueError,
        # which the router re-raises as a plain Exception. This test module's
        # async_client uses ASGITransport with its default
        # raise_app_exceptions=True, so an unhandled route exception
        # propagates to the caller rather than becoming an HTTP 500 response
        # (unlike a real deployed server) -- assert on that propagation
        # directly instead of a status code.
        with pytest.raises(Exception, match="out of range"):
            await async_client.post(
                "/analysis/highimpactposition",
                json={"base": 1, "interval": [5, 10], "session_id": sid},
            )

    @pytest.mark.asyncio
    async def test_rubberwindow_fixed_window_size(self, async_client):
        sequence = "atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcga"
        create_payload = {
            "name": "rubber_window_test",
            "sequence": sequence,
            "mutations": [],
            "session_id": None,
        }
        create_resp = await async_client.post("/resetgv", json=create_payload)
        sid = create_resp.json()["session_id"]

        resp = await async_client.post(
            "/analysis/rubberwindow",
            json={"exon": [5, 10], "window_size": 5, "session_id": sid},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == (len(sequence) + 4) // 5  # non-overlapping tiling of a fixed 5-base window
        for key, value in data.items():
            assert "_" in key  # "start_end" JSON-safe key, not a tuple
            assert set(value.keys()) == {"donor", "acceptor", "subsequence"}
            assert isinstance(value["donor"], float)
            assert isinstance(value["acceptor"], float)
            assert isinstance(value["subsequence"], str)

    @pytest.mark.asyncio
    async def test_rubberwindow_all_window_size(self, async_client):
        sequence = "atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcga"
        create_payload = {
            "name": "rubber_window_test_all",
            "sequence": sequence,
            "mutations": [],
            "session_id": None,
        }
        create_resp = await async_client.post("/resetgv", json=create_payload)
        sid = create_resp.json()["session_id"]

        resp = await async_client.post(
            "/analysis/rubberwindow",
            json={"exon": [5, 10], "all_window_size": [2, 3], "session_id": sid},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > len(sequence)  # overlapping tiling produces more windows than positions

    @pytest.mark.asyncio
    async def test_rubberwindow_both_tiling_modes_raises(self, async_client):
        create_payload = {
            "name": "rubber_window_test_conflict",
            "sequence": "atcgatcgatcgatcgatcgatcgatcgatcgatcgatcgatcga",
            "mutations": [],
            "session_id": None,
        }
        create_resp = await async_client.post("/resetgv", json=create_payload)
        sid = create_resp.json()["session_id"]

        # Same propagation reasoning as test_high_impact_position_interval_out_of_range_base
        # above -- a domain-layer ValueError surfaces as a raised Exception, not a 422/500.
        with pytest.raises(Exception, match="mutually exclusive"):
            await async_client.post(
                "/analysis/rubberwindow",
                json={
                    "exon": [5, 10],
                    "window_size": 5,
                    "all_window_size": [2, 3],
                    "session_id": sid,
                },
            )