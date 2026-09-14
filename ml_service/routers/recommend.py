"""
Recommendation router for the B2P ML microservice.

Ranks nearby vendors for a consumer by combining Haversine distance
with ML demand/suitability scores.
"""

from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, model_validator

try:
    from ml_service.haversine import haversine_distance_km
except ImportError:
    from haversine import haversine_distance_km

# ── Configurable Ranking Weights (easy to tune) ─────────────────────────────
WEIGHT_DISTANCE = 0.60
WEIGHT_SUITABILITY = 0.40


# ── Scoring Functions ────────────────────────────────────────────────────────
def calculate_distance_score(distance_km: float) -> float:
    """
    Convert distance in kilometers to a normalized proximity score in (0.0, 1.0].
    Shorter distances produce higher scores using inverse distance weighting.
    """
    return 1.0 / (1.0 + max(0.0, distance_km))


def calculate_combined_score(
    distance_km: float,
    suitability_score: float,
    weight_distance: float = WEIGHT_DISTANCE,
    weight_suitability: float = WEIGHT_SUITABILITY,
) -> float:
    """
    Combine distance and suitability score into a single composite score.

    Args:
        distance_km: Distance from consumer to vendor in kilometers.
        suitability_score: Demand/suitability score from ML model.
        weight_distance: Weight factor for distance component (e.g. 0.60).
        weight_suitability: Weight factor for suitability component (e.g. 0.40).

    Returns:
        Weighted composite ranking score.
    """
    distance_score = calculate_distance_score(distance_km)
    return (weight_distance * distance_score) + (weight_suitability * suitability_score)


# ── Request / Response Schemas ───────────────────────────────────────────────
class CandidateVendor(BaseModel):
    """Candidate vendor with location coordinates and ML suitability score."""

    vendor_id: str = Field(..., description="Unique vendor identifier")
    lat: float = Field(..., ge=-90.0, le=90.0, description="Vendor latitude in degrees")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Vendor longitude in degrees")
    suitability_score: float = Field(
        ..., description="Demand or suitability score from the ML model"
    )

    model_config = ConfigDict(extra="ignore")


class RecommendRequest(BaseModel):
    """Input payload for vendor recommendation request."""

    consumer_lat: float = Field(..., ge=-90.0, le=90.0, description="Consumer latitude")
    consumer_lon: float = Field(..., ge=-180.0, le=180.0, description="Consumer longitude")
    vendors: Optional[List[CandidateVendor]] = Field(
        None, description="List of candidate vendors to rank"
    )
    candidates: Optional[List[CandidateVendor]] = Field(
        None, description="Alternative alias for candidate vendors list"
    )
    top_n: Optional[int] = Field(
        None, ge=1, description="Optional maximum number of top vendors to return"
    )

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="after")
    def resolve_candidates(self) -> "RecommendRequest":
        """Accept candidate vendors via either 'vendors' or 'candidates' key."""
        if self.candidates is not None and self.vendors is None:
            self.vendors = self.candidates
        elif self.vendors is None:
            self.vendors = []
        return self


class RankedVendor(BaseModel):
    """Vendor recommendation result with distance, suitability, and final rank."""

    vendor_id: str = Field(..., description="Unique vendor identifier")
    distance_km: float = Field(..., description="Haversine distance from consumer in km")
    suitability_score: float = Field(..., description="Original ML suitability score")
    combined_score: float = Field(..., description="Combined ranking score")
    rank: int = Field(..., description="1-based rank position (1 = top match)")

    model_config = ConfigDict(extra="ignore")


# ── Core Pure Ranking Logic ──────────────────────────────────────────────────
def rank_vendors(
    consumer_lat: float,
    consumer_lon: float,
    candidates: List[CandidateVendor],
    top_n: Optional[int] = None,
    weight_distance: float = WEIGHT_DISTANCE,
    weight_suitability: float = WEIGHT_SUITABILITY,
) -> List[RankedVendor]:
    """
    Rank candidate vendors based on their Haversine distance from consumer coordinates
    and their ML suitability scores.

    Args:
        consumer_lat: Latitude of consumer.
        consumer_lon: Longitude of consumer.
        candidates: List of CandidateVendor objects.
        top_n: Maximum number of ranked vendors to return (all if None).
        weight_distance: Weight factor for distance component.
        weight_suitability: Weight factor for suitability component.

    Returns:
        List of RankedVendor objects sorted in descending order of combined score.
    """
    if not candidates:
        return []

    scored = []
    for vendor in candidates:
        dist_km = haversine_distance_km(
            consumer_lat, consumer_lon, vendor.lat, vendor.lon
        )
        score = calculate_combined_score(
            distance_km=dist_km,
            suitability_score=vendor.suitability_score,
            weight_distance=weight_distance,
            weight_suitability=weight_suitability,
        )
        scored.append({
            "vendor_id": vendor.vendor_id,
            "distance_km": round(dist_km, 4),
            "suitability_score": vendor.suitability_score,
            "combined_score": round(score, 4),
        })

    # Sort descending by combined score (highest first)
    scored.sort(key=lambda item: item["combined_score"], reverse=True)

    # Assign 1-based rank
    ranked_results: List[RankedVendor] = []
    for rank_idx, item in enumerate(scored, start=1):
        ranked_results.append(
            RankedVendor(
                vendor_id=item["vendor_id"],
                distance_km=item["distance_km"],
                suitability_score=item["suitability_score"],
                combined_score=item["combined_score"],
                rank=rank_idx,
            )
        )

    # Slice top N if requested
    if top_n is not None and top_n > 0:
        ranked_results = ranked_results[:top_n]

    return ranked_results


# ── FastAPI Router ───────────────────────────────────────────────────────────
router = APIRouter(tags=["recommendations"])


@router.post("/recommend", response_model=List[RankedVendor])
def recommend(payload: RecommendRequest) -> List[RankedVendor]:
    """
    POST /recommend endpoint.
    Ranks nearby candidate vendors for a consumer by combining spatial proximity
    (via Haversine distance) with model suitability scores.
    """
    candidate_list = payload.vendors or []
    return rank_vendors(
        consumer_lat=payload.consumer_lat,
        consumer_lon=payload.consumer_lon,
        candidates=candidate_list,
        top_n=payload.top_n,
        weight_distance=WEIGHT_DISTANCE,
        weight_suitability=WEIGHT_SUITABILITY,
    )
