# Movie Picks: a movie recommendation system on AWS

A streaming-app style movie recommender: pick a few movies you love, get personalised rows ("Because you liked Alien"), open any movie for its poster, plot, cast and "more like this". No sign-up: each browser gets an anonymous id. Built on the [MovieLens](https://grouplens.org/datasets/movielens/) dataset with a hybrid content + collaborative filtering model, with posters and details from [TMDB](https://www.themoviedb.org/).

**AWS:** S3 (website + model), Lambda (Python API), API Gateway, DynamoDB (ratings), IAM, deployed with AWS SAM (CloudFormation). It also runs fully on your laptop, using Amazon's DynamoDB Local Docker image.

See [docs/architecture.md](docs/architecture.md) for the diagram, what each AWS service does, and how the recommendations are computed.

## Run it locally

Needs Python 3.12+ and Docker.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

python train.py            # downloads MovieLens (~1 MB) and builds model/model.json.gz
./scripts/run-local.sh     # starts DynamoDB Local in Docker + the app
```

Open <http://localhost:8000> and tap a few movies you love.

### Add real posters and movie details (recommended)

Without this step the app shows generated genre posters and no plot/cast.

1. Get a free TMDB key: sign up at [themoviedb.org](https://www.themoviedb.org/signup), then Settings → API. Either the "API Key" or the "API Read Access Token" works.
2. `cp .env.example .env` and paste it after `TMDB_API_KEY=`. `.env` is git-ignored.
3. Fetch the details and rebuild the model:

   ```bash
   python enrich.py           # ~3 minutes for 9,700 movies; safe to stop and rerun
   python train.py
   ```

4. Restart `./scripts/run-local.sh`.

The key is only used by `enrich.py` on your machine. It is never sent to the browser, put in the model, or deployed to AWS.
Interactive API docs: <http://localhost:8000/docs>.

Stop DynamoDB Local with `docker compose down` (add `-v` to also delete saved ratings).

## Tests

```bash
pytest
```

Covers TMDB fetching (with a fake HTTP layer: rate limits, retries, resume), the training pipeline, the recommender, the DynamoDB store (mocked with moto), the API (including error cases) and the Lambda handler with a real API Gateway event.

## Deploy to AWS (optional)

Needs an AWS account, the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (run `aws configure`) and the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).

```bash
./scripts/deploy.sh        # prints the website URL at the end
./scripts/destroy.sh       # deletes everything again
```

Everything fits in the AWS free tier for a demo. Run `destroy.sh` when you're done anyway.

> AWS Academy / Learner Lab accounts can't create IAM roles. There, replace the
> `Policies:` block of `ApiFunction` in `template.yaml` with `Role: <your LabRole ARN>`
> and drop `--capabilities CAPABILITY_IAM` from `deploy.sh`.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/movies/search?q=matrix` | Find movies by title |
| GET | `/api/movies/popular` | Top-rated movies (shown to new users) |
| GET | `/api/movies/{id}` | Full details: poster, backdrop, plot, cast, director, runtime, average rating |
| GET | `/api/movies/{id}/similar` | Movies similar to this one |
| GET | `/api/users/{user}/ratings` | A user's ratings |
| PUT | `/api/users/{user}/ratings/{id}` | Rate a movie: body `{"rating": 4.5}` (0.5–5) |
| DELETE | `/api/users/{user}/ratings/{id}` | Remove a rating |
| GET | `/api/users/{user}/recommendations` | Personalised recommendations |

`{user}` is the anonymous id the website generates (letters, digits, `-`, `_`; max 40).

All list endpoints accept `?limit=`.

## Project layout

```
app/
  recommender.py   recommendation logic (pure Python)
  storage.py       ratings in DynamoDB
  model_loader.py  loads the model from disk or S3
  main.py          HTTP API (FastAPI)
  server.py        wiring from env vars; Lambda handler
frontend/          static website (no build step)
  js/views/        welcome, home, movie details, search, my ratings
enrich.py          offline: fetches posters/details from TMDB
train.py           offline model builder (merges the TMDB data in)
template.yaml      AWS infrastructure (SAM)
docker-compose.yml DynamoDB Local
scripts/           run-local.sh, deploy.sh, destroy.sh
tests/
```

## Data credits

Movie data and images from [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB.

F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context. ACM TiiS 5, 4: 19. Used under the GroupLens terms for non-commercial/educational use.
