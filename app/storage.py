"""User ratings in DynamoDB: one item per (userId, movieId)."""

import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError


class StoreUnavailable(Exception):
    """DynamoDB could not be reached (locally: is `docker compose up` running?)."""


def _unavailable(error):
    if isinstance(error, ClientError) and error.response["Error"]["Code"] != "ResourceNotFoundException":
        raise error
    raise StoreUnavailable(f"ratings store unavailable: {error}") from error


class RatingsStore:
    def __init__(self, table_name, endpoint_url=None, region=None):
        region = region or os.environ.get("AWS_REGION", "us-east-1")
        config = Config(connect_timeout=2, read_timeout=5, retries={"max_attempts": 2})
        self._dynamodb = boto3.resource(
            "dynamodb", endpoint_url=endpoint_url, region_name=region, config=config
        )
        self._table = self._dynamodb.Table(table_name)

    def ensure_table(self):
        """Create the table if it does not exist (local development only;
        on AWS the SAM template creates it)."""
        try:
            self._table.load()
        except ClientError as error:
            if error.response["Error"]["Code"] != "ResourceNotFoundException":
                raise
            self._table = self._dynamodb.create_table(
                TableName=self._table.name,
                KeySchema=[
                    {"AttributeName": "userId", "KeyType": "HASH"},
                    {"AttributeName": "movieId", "KeyType": "RANGE"},
                ],
                AttributeDefinitions=[
                    {"AttributeName": "userId", "AttributeType": "S"},
                    {"AttributeName": "movieId", "AttributeType": "N"},
                ],
                BillingMode="PAY_PER_REQUEST",
            )
            self._table.wait_until_exists()
        except BotoCoreError as error:
            _unavailable(error)

    def put_rating(self, user_id, movie_id, rating):
        try:
            self._table.put_item(
                Item={"userId": user_id, "movieId": movie_id, "rating": Decimal(str(rating))}
            )
        except (BotoCoreError, ClientError) as error:
            _unavailable(error)

    def get_ratings(self, user_id):
        ratings = {}
        kwargs = {"KeyConditionExpression": Key("userId").eq(user_id)}
        try:
            while True:
                page = self._table.query(**kwargs)
                for item in page["Items"]:
                    ratings[int(item["movieId"])] = float(item["rating"])
                if "LastEvaluatedKey" not in page:
                    return ratings
                kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        except (BotoCoreError, ClientError) as error:
            _unavailable(error)
