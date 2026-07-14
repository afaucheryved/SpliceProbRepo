"""
Synthetic test payloads for SpliceProb API endpoints.
Run with: python test_payloads.py [--server http://127.0.0.1:8000] [endpoint_filter]
"""
import json
import sys
import urllib.request
import urllib.error

SERVER = "http://127.0.0.1:8000"

# ─── Synthetic DNA Sequence ───
# 80bp repeating ATCG pattern
BASE_SEQUENCE = "acgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgt"

# ─── Payloads ───

# POST /GetSimpleProb/
PAYLOAD_SIMPLE = {
    "name": "test_simple",
    "mutations": [""],
    "sequence": BASE_SEQUENCE,
    "altered_sequence": "",
}

# POST /GetDeltaScore/
PAYLOAD_DELTA = {
    "name": "test_delta",
    "mutations": [
        ">p.1.a>c",
        ">p.4.t>a",
        ">p.10.c>a",
        ">p.5.a>g",
        ">p.8.t>c",
        ">p.15.c>t",
    ],
    "sequence": BASE_SEQUENCE,
    "altered_sequence": "",
}

# POST /resetgv
PAYLOAD_RESETGV = {
    "name": "test_reset",
    "sequence": BASE_SEQUENCE,
    "mutations": [""],
    "altered_sequence": "",
}

# POST /altbyindex/delet (needs session_id)
# POST /altbyindex/insert (needs session_id)
PAYLOAD_INSERT = {
    "pattern": "aaaa",
    "index": 3,
    "length": 4,
    "session_id": None,  # to be filled
}

# POST /altbyindex/move (needs session_id)
PAYLOAD_MOVE = {
    "start_cc": 3,
    "end_cc": 7,
    "index_paste": 15,
    "length_past": 4,
    "session_id": None,
}

# POST /altbyindex/copypast (needs session_id)
PAYLOAD_COPYPASTE = {
    "start_cc": 3,
    "end_cc": 7,
    "index_paste": 15,
    "length_past": 4,
    "session_id": None,
}

# POST /altbypattern/replace (needs session_id)
PAYLOAD_REPLACE = {
    "old": "acgt",
    "new": "tgca",
    "session_id": None,
}

# POST /altbypattern/delet (needs session_id)
PAYLOAD_DELPATTERN = {
    "pattern": "acgt",
    "session_id": None,
}

# POST /mutateindependently (needs session_id)
PAYLOAD_MUTATE = {
    "prob_mat": [
        [0.9, 0.03, 0.03, 0.04],
        [0.03, 0.9, 0.04, 0.03],
        [0.04, 0.03, 0.9, 0.03],
        [0.03, 0.04, 0.03, 0.9],
    ],
    "session_id": None,
}

# POST /analysis/patterninzona (needs session_id)
PAYLOAD_ANALYSIS = {
    "step": 10,
    "penality": 10,
    "threshold": 30,
    "specified_models_used": [5],
    "session_id": None,
}


ENDPOINTS = [
    ("POST /GetSimpleProb/", "/GetSimpleProb/", PAYLOAD_SIMPLE),
    ("POST /GetDeltaScore/", "/GetDeltaScore/", PAYLOAD_DELTA),
    ("POST /resetgv", "/resetgv", PAYLOAD_RESETGV),
    ("POST /altbyindex/insert", "/altbyindex/insert", PAYLOAD_INSERT),
    ("POST /altbyindex/delet", "/altbyindex/delet", {
        "start": 2, "end": 6, "session_id": None
    }),
    ("POST /altbyindex/move", "/altbyindex/move", PAYLOAD_MOVE),
    ("POST /altbyindex/copypast", "/altbyindex/copypast", PAYLOAD_COPYPASTE),
    ("POST /altbypattern/replace", "/altbypattern/replace", PAYLOAD_REPLACE),
    ("POST /altbypattern/delet", "/altbypattern/delet", PAYLOAD_DELPATTERN),
    ("POST /mutateindependently", "/mutateindependently", PAYLOAD_MUTATE),
    ("POST /analysis/patterninzona", "/analysis/patterninzona", PAYLOAD_ANALYSIS),
]


def do_request(method: str, path: str, body: dict) -> dict:
    url = f"{SERVER}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=300)
        result = json.loads(resp.read().decode("utf-8"))
        return {"status": resp.status, "body": result}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8")
        return {"status": e.code, "body": detail}


def test_all():
    results = []
    global_session_id = None

    for name, path, payload in ENDPOINTS:
        print(f"\n{'='*60}")
        print(f"Testing: {name}")
        print(f"{'='*60}")
        print(f"Request: {json.dumps(payload, indent=2)}")

        # Fill in session_id if needed
        p = dict(payload)
        if "session_id" in p and global_session_id is not None:
            p["session_id"] = global_session_id

        result = do_request("POST", path, p)
        print(f"Response [{result['status']}]: {json.dumps(result['body'], indent=2, default=str)[:2000]}")

        # Capture session_id from first POST that returns one
        if isinstance(result["body"], dict):
            sid = result["body"].get("session_id")
            if sid and global_session_id is None:
                global_session_id = sid
                print(f"  → Captured session_id: {sid}")

        results.append((name, result))

    print(f"\n\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    ok = 0
    fail = 0
    for name, result in results:
        if result["status"] == 200:
            ok += 1
            print(f"  ✅ {name}")
        else:
            fail += 1
            print(f"  ❌ {name} — HTTP {result['status']}")
    print(f"\nPassed: {ok}/{len(results)}  Failed: {fail}/{len(results)}")

    # Test GET endpoints
    if global_session_id:
        print(f"\n\nTesting GET endpoints with session_id={global_session_id}")
        for get_path in ["/get/sequence", "/get/gv", "/get/simpleproba", "/get/delatproba", "/get/mutations", "/get/alteredsequence"]:
            url = f"{SERVER}{get_path}?session_id={global_session_id}"
            try:
                resp = urllib.request.urlopen(url, timeout=60)
                body = json.loads(resp.read().decode("utf-8"))
                print(f"  ✅ GET {get_path} — {json.dumps(body, default=str)[:300]}")
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8")[:300]
                print(f"  ❌ GET {get_path} — HTTP {e.code}: {detail}")

    return fail == 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        SERVER = sys.argv[2]
    success = test_all()
    sys.exit(0 if success else 1)