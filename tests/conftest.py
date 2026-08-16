import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agents"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("FIRESTORE_DISABLED", "true")
os.environ.setdefault("BIGQUERY_DISABLED", "true")
os.environ.setdefault("USE_SECRET_MANAGER", "false")
os.environ.setdefault("CFO_AGENT_SHARED_SECRET", "test-secret")
os.environ.setdefault("BACKEND_INTERNAL_SECRET", "test-internal-secret")
os.environ.setdefault("BQ_LOCAL_FALLBACK_PATH", os.path.join(os.path.dirname(__file__), "bigquery_local_test.jsonl"))
