"""Recommendation logic over the precomputed model. Pure Python, no AWS/HTTP."""

from collections import defaultdict

NEUTRAL_RATING = 3.0  # ratings above this pull neighbours up, below push them down


class Recommender:
    def __init__(self, model):
        self._movies = {int(i): m for i, m in model["movies"].items()}
        self._neighbours = {int(i): n for i, n in model["neighbours"].items()}
        self._popular = list(model["popular"])

    def movie(self, movie_id):
        m = self._movies.get(movie_id)
        if m is None:
            return None
        return {"id": movie_id, "title": m["title"], "year": m["year"], "genres": m["genres"]}

    def search(self, query, limit=20):
        query = query.strip().lower()
        if not query:
            return []
        hits = [i for i, m in self._movies.items() if query in m["title"].lower()]
        hits.sort(key=lambda i: -self._movies[i].get("count", 0))
        return [self.movie(i) for i in hits[:limit]]

    def popular(self, limit=20, exclude=()):
        ids = [i for i in self._popular if i not in exclude and i in self._movies]
        return [self.movie(i) for i in ids[:limit]]

    def similar(self, movie_id, limit=10):
        return [
            {**self.movie(n), "score": score}
            for n, score in self._neighbours.get(movie_id, [])[:limit]
        ]

    def recommend(self, ratings, limit=20):
        """Score each neighbour of a rated movie by sum(weight * similarity),
        where weight = rating - 3. Falls back to popular movies when the user
        has no positive signal yet."""
        scores = defaultdict(float)
        contributions = defaultdict(dict)  # candidate -> {rated movie: contribution}
        for rated_id, rating in ratings.items():
            weight = rating - NEUTRAL_RATING
            for n, similarity in self._neighbours.get(rated_id, []):
                scores[n] += weight * similarity
                contributions[n][rated_id] = weight * similarity

        candidates = [i for i, s in scores.items() if s > 0 and i not in ratings]
        candidates.sort(key=lambda i: -scores[i])
        if not candidates:
            return [{**m, "score": None, "because": None} for m in self.popular(limit, exclude=ratings)]

        results = []
        for i in candidates[:limit]:
            reason = max(contributions[i], key=contributions[i].get)
            results.append({**self.movie(i), "score": round(scores[i], 4), "because": self._movies[reason]["title"]})
        return results
