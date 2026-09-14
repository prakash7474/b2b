"""
FastAPI ML microservice application entrypoint for B2P.
"""

from fastapi import FastAPI
from ml_service.routers.recommend import router as recommend_router

app = FastAPI(
    title="B2P ML Recommendation Engine",
    description="Microservice for ranking vendors using Haversine distance and ML suitability scores",
    version="1.0.0",
)

app.include_router(recommend_router)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "b2p-recommendation-engine"}
