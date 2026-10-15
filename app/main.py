"""HTTP API. `create_app` receives its dependencies, so tests can pass fakes;
app/server.py wires up the real ones from environment variables."""

from fastapi import FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.storage import StoreUnavailable

UserId = Path(pattern=r"^[A-Za-z0-9_-]{1,40}$", description="Letters, digits, _ or -")
Limit = Query(20, ge=1, le=100)


class RatingIn(BaseModel):
    rating: float = Field(ge=0.5, le=5.0)


def create_app(recommender, store, frontend_dir=None):
    app = FastAPI(title="Movie Recommender")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "PUT", "DELETE"], allow_headers=["*"])

    @app.exception_handler(StoreUnavailable)
    async def store_unavailable(request: Request, exc: StoreUnavailable):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    def require_movie(movie_id):
        movie = recommender.movie(movie_id)
        if movie is None:
            raise HTTPException(status_code=404, detail=f"Unknown movie id {movie_id}")
        return movie

    @app.get("/api/movies/search")
    def search(q: str = Query(min_length=1), limit: int = Limit):
        return recommender.search(q, limit)

    @app.get("/api/movies/popular")
    def popular(limit: int = Limit):
        return recommender.popular(limit)

    @app.get("/api/movies/{movie_id}")
    def details(movie_id: int):
        require_movie(movie_id)
        return recommender.details(movie_id)

    @app.get("/api/movies/{movie_id}/similar")
    def similar(movie_id: int, limit: int = Query(10, ge=1, le=30)):
        require_movie(movie_id)
        return recommender.similar(movie_id, limit)

    @app.get("/api/users/{user_id}/ratings")
    def list_ratings(user_id: str = UserId):
        ratings = store.get_ratings(user_id)
        rated = [{**recommender.movie(i), "rating": r} for i, r in ratings.items() if recommender.movie(i)]
        return sorted(rated, key=lambda m: -m["rating"])

    @app.put("/api/users/{user_id}/ratings/{movie_id}")
    def rate(movie_id: int, body: RatingIn, user_id: str = UserId):
        require_movie(movie_id)
        store.put_rating(user_id, movie_id, body.rating)
        return {"movieId": movie_id, "rating": body.rating}

    @app.delete("/api/users/{user_id}/ratings/{movie_id}", status_code=204)
    def unrate(movie_id: int, user_id: str = UserId):
        store.delete_rating(user_id, movie_id)
        return Response(status_code=204)

    @app.get("/api/users/{user_id}/recommendations")
    def recommendations(user_id: str = UserId, limit: int = Limit):
        return recommender.recommend(store.get_ratings(user_id), limit)

    if frontend_dir is not None:
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app
