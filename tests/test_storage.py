import pytest
from moto import mock_aws

from app.storage import RatingsStore, StoreUnavailable


@pytest.fixture
def store(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    with mock_aws():
        store = RatingsStore("Ratings")
        store.ensure_table()
        yield store


def test_new_user_has_no_ratings(store):
    assert store.get_ratings("alice") == {}


def test_put_then_get_returns_float_ratings_keyed_by_movie_id(store):
    store.put_rating("alice", 1, 4.5)
    store.put_rating("alice", 42, 2.0)
    ratings = store.get_ratings("alice")
    assert ratings == {1: 4.5, 42: 2.0}
    assert all(isinstance(r, float) for r in ratings.values())


def test_rating_same_movie_again_overwrites(store):
    store.put_rating("alice", 1, 2.0)
    store.put_rating("alice", 1, 5.0)
    assert store.get_ratings("alice") == {1: 5.0}


def test_users_are_isolated(store):
    store.put_rating("alice", 1, 5.0)
    store.put_rating("bob", 2, 3.0)
    assert store.get_ratings("bob") == {2: 3.0}


def test_ensure_table_is_idempotent(store):
    store.ensure_table()
    store.put_rating("alice", 1, 5.0)
    assert store.get_ratings("alice") == {1: 5.0}


def test_unreachable_endpoint_raises_store_unavailable(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    store = RatingsStore("Ratings", endpoint_url="http://127.0.0.1:1")
    with pytest.raises(StoreUnavailable):
        store.get_ratings("alice")
    with pytest.raises(StoreUnavailable):
        store.put_rating("alice", 1, 5.0)
    with pytest.raises(StoreUnavailable):
        store.delete_rating("alice", 1)


def test_delete_rating_removes_only_that_movie(store):
    store.put_rating("alice", 1, 5.0)
    store.put_rating("alice", 2, 4.0)
    store.delete_rating("alice", 1)
    assert store.get_ratings("alice") == {2: 4.0}


def test_delete_missing_rating_is_a_no_op(store):
    store.delete_rating("alice", 1)
    assert store.get_ratings("alice") == {}
