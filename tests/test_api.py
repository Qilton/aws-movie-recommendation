import json

import pytest
from fastapi.testclient import TestClient
from mangum import Mangum
from moto import mock_aws

from app.main import create_app
from app.recommender import Recommender
from app.storage import RatingsStore, StoreUnavailable


@pytest.fixture
def aws_env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    with mock_aws():
        yield


@pytest.fixture
def store(aws_env):
    store = RatingsStore("Ratings")
    store.ensure_table()
    return store


@pytest.fixture
def client(tiny_model, store):
    return TestClient(create_app(Recommender(tiny_model), store))


def ids(response):
    return [m["id"] for m in response.json()]


def test_search(client):
    response = client.get("/api/movies/search", params={"q": "alien"})
    assert response.status_code == 200
    assert ids(response) == [3, 4]


def test_search_requires_query(client):
    assert client.get("/api/movies/search").status_code == 422


def test_popular_with_limit(client):
    assert ids(client.get("/api/movies/popular", params={"limit": 2})) == [5, 1]


def test_limit_out_of_range_is_rejected(client):
    assert client.get("/api/movies/popular", params={"limit": 0}).status_code == 422
    assert client.get("/api/movies/popular", params={"limit": 101}).status_code == 422


def test_similar(client):
    response = client.get("/api/movies/3/similar")
    assert response.status_code == 200
    assert response.json()[0] == {
        "id": 4, "title": "Aliens", "year": 1986, "genres": ["Horror", "Sci-Fi"], "poster": None, "score": 0.8,
    }


def test_similar_unknown_movie_is_404(client):
    assert client.get("/api/movies/999/similar").status_code == 404


def test_rate_then_list_ratings(client):
    response = client.put("/api/users/alice/ratings/3", json={"rating": 4.5})
    assert response.status_code == 200
    assert response.json() == {"movieId": 3, "rating": 4.5}
    listed = client.get("/api/users/alice/ratings").json()
    assert [(m["id"], m["title"], m["rating"]) for m in listed] == [(3, "Alien", 4.5)]
    assert listed[0]["poster"] == "https://image.tmdb.org/t/p/w342/alien.jpg"


def test_rating_unknown_movie_is_404_and_not_stored(client, store):
    assert client.put("/api/users/alice/ratings/999", json={"rating": 4}).status_code == 404
    assert store.get_ratings("alice") == {}


@pytest.mark.parametrize("rating", [0, 0.4, 5.5, "great", None])
def test_invalid_rating_is_422(client, rating):
    assert client.put("/api/users/alice/ratings/3", json={"rating": rating}).status_code == 422


@pytest.mark.parametrize("user", ["a" * 41, "bad user", "émile", "x;drop"])
def test_invalid_user_id_is_422(client, user):
    assert client.get(f"/api/users/{user}/recommendations").status_code == 422


def test_recommendations_use_stored_ratings(client):
    client.put("/api/users/alice/ratings/3", json={"rating": 5})
    recs = client.get("/api/users/alice/recommendations").json()
    assert recs[0]["id"] == 4 and recs[0]["because"] == "Alien"


def test_new_user_gets_popular_movies(client):
    assert ids(client.get("/api/users/newbie/recommendations", params={"limit": 3})) == [5, 1, 3]


class DownStore:
    def get_ratings(self, user_id):
        raise StoreUnavailable("ratings store unavailable: connection refused")

    def put_rating(self, user_id, movie_id, rating):
        raise StoreUnavailable("ratings store unavailable: connection refused")

    def delete_rating(self, user_id, movie_id):
        raise StoreUnavailable("ratings store unavailable: connection refused")


def test_store_down_returns_503_with_message(tiny_model):
    client = TestClient(create_app(Recommender(tiny_model), DownStore()))
    for response in (
        client.get("/api/users/alice/recommendations"),
        client.put("/api/users/alice/ratings/3", json={"rating": 5}),
        client.delete("/api/users/alice/ratings/3"),
    ):
        assert response.status_code == 503
        assert "ratings store unavailable" in response.json()["detail"]


def test_cors_allows_browser_on_other_origin(client):
    response = client.get("/api/movies/popular", headers={"Origin": "http://example-bucket.s3-website.amazonaws.com"})
    assert response.headers["access-control-allow-origin"] == "*"


def test_serves_frontend_when_given(tiny_model, store, tmp_path):
    (tmp_path / "index.html").write_text("<h1>Movies</h1>")
    client = TestClient(create_app(Recommender(tiny_model), store, frontend_dir=tmp_path))
    assert client.get("/").text == "<h1>Movies</h1>"
    assert client.get("/api/movies/popular").status_code == 200


def test_lambda_handler_serves_api_gateway_event(tiny_model, store):
    handler = Mangum(create_app(Recommender(tiny_model), store), lifespan="off")
    event = {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": "/api/movies/popular",
        "rawQueryString": "limit=1",
        "headers": {"host": "abc.execute-api.us-east-1.amazonaws.com"},
        "requestContext": {
            "http": {"method": "GET", "path": "/api/movies/popular", "sourceIp": "1.2.3.4", "protocol": "HTTP/1.1"},
            "stage": "$default",
        },
        "isBase64Encoded": False,
    }
    response = handler(event, None)
    assert response["statusCode"] == 200
    assert [m["id"] for m in json.loads(response["body"])] == [5]


def test_movie_details(client):
    response = client.get("/api/movies/3")
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Alien" and body["director"] == "Ridley Scott"
    assert body["poster"].endswith("/w342/alien.jpg") and body["backdrop"].endswith("/w1280/alien-wide.jpg")


def test_movie_details_unknown_is_404(client):
    assert client.get("/api/movies/999").status_code == 404


def test_search_route_still_wins_over_details_route(client):
    assert client.get("/api/movies/search", params={"q": "heat"}).json()[0]["id"] == 5


def test_delete_rating(client, store):
    client.put("/api/users/alice/ratings/3", json={"rating": 5})
    response = client.delete("/api/users/alice/ratings/3")
    assert response.status_code == 204
    assert store.get_ratings("alice") == {}


def test_delete_rating_that_does_not_exist_is_204(client):
    assert client.delete("/api/users/alice/ratings/3").status_code == 204


def test_uuid_user_ids_are_accepted(client):
    user = "3f2b8c1e-9a4d-4e6b-8f0a-1c2d3e4f5a6b"
    assert client.put(f"/api/users/{user}/ratings/3", json={"rating": 5}).status_code == 200
    assert client.get(f"/api/users/{user}/recommendations").json()[0]["id"] == 4
