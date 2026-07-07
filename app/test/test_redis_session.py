"""
Unit tests for Redis session management (redis_session.py).
Uses fakeredis via the module's automatic fallback.
"""
import json
import pytest
from app.services.redis_session import (
    set_session_data,
    get_session_data,
)


class TestSetSessionData:
    def test_set_and_get_string_value(self):
        """Store a simple string and retrieve it."""
        set_session_data("session_1", "my_key", "hello_world")
        val = get_session_data("session_1", "my_key")
        assert val == "hello_world"

    def test_set_and_get_list_value(self):
        """Store a list and retrieve it."""
        data = [1, 2, 3, "four"]
        set_session_data("session_2", "list_key", data)
        val = get_session_data("session_2", "list_key")
        assert val == data

    def test_set_and_get_dict_value(self):
        """Store a dict and retrieve it."""
        data = {"name": "test", "values": [0.1, 0.2]}
        set_session_data("session_3", "dict_key", data)
        val = get_session_data("session_3", "dict_key")
        assert val == data

    def test_set_and_get_none_value(self):
        """Store None and retrieve it. Redis stores None as the string 'null'."""
        set_session_data("session_4", "none_key", None)
        val = get_session_data("session_4", "none_key")
        assert val is None  # JSON null → Python None

    def test_set_with_custom_ttl(self):
        """Ensure custom TTL does not break storage."""
        set_session_data("session_5", "ttl_key", "ttl_value", ttl=60)
        val = get_session_data("session_5", "ttl_key")
        assert val == "ttl_value"


class TestGetSessionData:
    def test_get_nonexistent_key(self):
        """Accessing a non-existent key returns None."""
        val = get_session_data("nonexistent_session", "nonexistent_key")
        assert val is None

    def test_get_nonexistent_session(self):
        """Accessing a non-existent session returns None."""
        val = get_session_data("nosession", "key")
        assert val is None

    def test_get_after_set_overwrites(self):
        """Setting the same key twice overwrites the value."""
        set_session_data("session_6", "overwrite_key", "first")
        set_session_data("session_6", "overwrite_key", "second")
        val = get_session_data("session_6", "overwrite_key")
        assert val == "second"

    def test_isolation_between_sessions(self):
        """Data stored in one session must not leak into another."""
        set_session_data("session_a", "shared_key", "value_a")
        set_session_data("session_b", "shared_key", "value_b")
        val_a = get_session_data("session_a", "shared_key")
        val_b = get_session_data("session_b", "shared_key")
        assert val_a == "value_a"
        assert val_b == "value_b"

    def test_isolation_between_keys_same_session(self):
        """Different keys in the same session do not interfere."""
        set_session_data("session_c", "key1", "val1")
        set_session_data("session_c", "key2", "val2")
        assert get_session_data("session_c", "key1") == "val1"
        assert get_session_data("session_c", "key2") == "val2"

    def test_large_data(self):
        """Store and retrieve a moderately large structure."""
        large_data = {str(i): i * 2 for i in range(1000)}
        set_session_data("session_large", "large", large_data)
        val = get_session_data("session_large", "large")
        assert val == large_data


class TestEdgeCases:
    def test_empty_string_key_and_value(self):
        """Empty strings as key and value."""
        set_session_data("empty_test", "", "")
        val = get_session_data("empty_test", "")
        assert val == ""

    def test_special_characters(self):
        """Unicode and special characters in values."""
        data = {"emoji": "🚀", "accent": "éàü", "script": "<script>alert('xss')</script>"}
        set_session_data("special", "chars", data)
        val = get_session_data("special", "chars")
        assert val == data

    def test_boolean_values(self):
        """Boolean values are preserved."""
        set_session_data("bool_test", "true_key", True)
        set_session_data("bool_test", "false_key", False)
        assert get_session_data("bool_test", "true_key") is True
        assert get_session_data("bool_test", "false_key") is False

    def test_nested_structures(self):
        """Deeply nested dicts/lists."""
        data = {"level1": {"level2": {"level3": [1, [2, [3]]]}}}
        set_session_data("nested_test", "nested", data)
        val = get_session_data("nested_test", "nested")
        assert val == data

    def test_multiple_session_round_trips(self):
        """Multiple operations on the same session."""
        set_session_data("multi", "a", 1)
        set_session_data("multi", "b", 2)
        set_session_data("multi", "c", 3)
        assert get_session_data("multi", "a") == 1
        assert get_session_data("multi", "b") == 2
        assert get_session_data("multi", "c") == 3