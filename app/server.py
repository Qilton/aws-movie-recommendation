"""Entry point, configured by environment variables.

Locally:   uvicorn app.server:app          (see scripts/run-local.sh)
On Lambda: handler = app.server.handler    (see template.yaml)
"""

import logging
import os
from pathlib import Path

from mangum import Mangum

from app.main import create_app
from app.model_loader import load_model
from app.recommender import Recommender
from app.storage import RatingsStore, StoreUnavailable

log = logging.getLogger(__name__)

dynamodb_endpoint = os.environ.get("DYNAMODB_ENDPOINT") or None
store = RatingsStore(os.environ.get("RATINGS_TABLE", "Ratings"), endpoint_url=dynamodb_endpoint)

if dynamodb_endpoint:  # local DynamoDB: create the table on first run
    try:
        store.ensure_table()
    except StoreUnavailable as error:
        log.warning("%s -- start it with: docker compose up -d", error)

on_lambda = "AWS_LAMBDA_FUNCTION_NAME" in os.environ
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
app = create_app(
    Recommender(load_model()),
    store,
    frontend_dir=frontend_dir if not on_lambda and frontend_dir.exists() else None,
)
handler = Mangum(app, lifespan="off")
