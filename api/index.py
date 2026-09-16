"""
Vercel Serverless Function Entry Point
Exposes the FastAPI app for Vercel's Python runtime.
"""
import sys
import os

# Add backend directory to Python path so imports like
# `from app.physics.engine_model import ...` resolve correctly.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.main import app
