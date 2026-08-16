"""Backward-compatible Uvicorn entry point.

Run with: uvicorn main:app --reload --port 8000
"""

from app.main import app

__all__ = ["app"]
