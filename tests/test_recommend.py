"""
Unit and integration tests for recommendation router in app/routers/recommend.py.
"""

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.routers.recommend import (
    WEIGHT_DISTANCE,
    WEIGHT_SUITABILITY,
    CandidateVendor,
    RecommendRequest,
    calculate_distance_score,
    calculate_combined_score,
    rank_vendors,
)


class TestRecommendationEngine(unittest.TestCase):
    """Test suite for vendor recommendation ranking logic."""

    def setUp(self):
        self.client = TestClient(app)
        # Consumer location: T. Nagar, Chennai
        self.consumer_lat = 13.0418
        self.consumer_lon = 80.2341

    def test_configurable_weights_constants(self):
        """Verify weights are configured at module level (60/40 default)."""
        self.assertEqual(WEIGHT_DISTANCE, 0.60)
        self.assertEqual(WEIGHT_SUITABILITY, 0.40)
        self.assertAlmostEqual(WEIGHT_DISTANCE + WEIGHT_SUITABILITY, 1.0)

    def test_distance_score_monotonicity(self):
        """Distance score must be in (0, 1] and strictly decrease as distance increases."""
        score_0km = calculate_distance_score(0.0)
        score_1km = calculate_distance_score(1.0)
        score_5km = calculate_distance_score(5.0)
        score_10km = calculate_distance_score(10.0)

        self.assertEqual(score_0km, 1.0)
        self.assertGreater(score_0km, score_1km)
        self.assertGreater(score_1km, score_5km)
        self.assertGreater(score_5km, score_10km)
        self.assertGreater(score_10km, 0.0)

    def test_ranking_closer_vendor_higher_when_suitability_equal(self):
        """Closer vendor must rank higher when suitability scores are identical."""
        candidates = [
            # Far vendor (~5 km away)
            CandidateVendor(
                vendor_id="V_FAR",
                lat=13.0827,
                lon=80.2707,
                suitability_score=0.8,
            ),
            # Very close vendor (~0.2 km away)
            CandidateVendor(
                vendor_id="V_CLOSE",
                lat=13.0420,
                lon=80.2350,
                suitability_score=0.8,
            ),
        ]
        results = rank_vendors(
            consumer_lat=self.consumer_lat,
            consumer_lon=self.consumer_lon,
            candidates=candidates,
        )
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].vendor_id, "V_CLOSE")
        self.assertEqual(results[0].rank, 1)
        self.assertEqual(results[1].vendor_id, "V_FAR")
        self.assertEqual(results[1].rank, 2)
        self.assertLess(results[0].distance_km, results[1].distance_km)
        self.assertGreater(results[0].combined_score, results[1].combined_score)

    def test_ranking_higher_suitability_when_distance_equal(self):
        """Vendor with higher suitability must rank higher when distances are equal."""
        # Both vendors at the same location
        candidates = [
            CandidateVendor(
                vendor_id="V_LOW_SUITABILITY",
                lat=13.0500,
                lon=80.2400,
                suitability_score=0.3,
            ),
            CandidateVendor(
                vendor_id="V_HIGH_SUITABILITY",
                lat=13.0500,
                lon=80.2400,
                suitability_score=0.9,
            ),
        ]
        results = rank_vendors(
            consumer_lat=self.consumer_lat,
            consumer_lon=self.consumer_lon,
            candidates=candidates,
        )
        self.assertEqual(results[0].vendor_id, "V_HIGH_SUITABILITY")
        self.assertEqual(results[0].rank, 1)
        self.assertEqual(results[1].vendor_id, "V_LOW_SUITABILITY")
        self.assertEqual(results[1].rank, 2)
        self.assertEqual(results[0].distance_km, results[1].distance_km)
        self.assertGreater(results[0].combined_score, results[1].combined_score)

    def test_combined_score_calculation(self):
        """Verify combined score matches 60/40 weighting."""
        dist = 2.0
        suitability = 0.75
        expected_dist_score = 1.0 / (1.0 + 2.0)  # 1/3
        expected_combined = (0.60 * expected_dist_score) + (0.40 * 0.75)
        computed_combined = calculate_combined_score(dist, suitability, 0.60, 0.40)
        self.assertAlmostEqual(computed_combined, expected_combined, places=5)

    def test_top_n_filtering(self):
        """Return only top N vendors when top_n is specified."""
        candidates = [
            CandidateVendor(vendor_id=f"V{i}", lat=13.04 + i * 0.01, lon=80.23 + i * 0.01, suitability_score=0.5)
            for i in range(5)
        ]
        results = rank_vendors(
            consumer_lat=self.consumer_lat,
            consumer_lon=self.consumer_lon,
            candidates=candidates,
            top_n=2,
        )
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].rank, 1)
        self.assertEqual(results[1].rank, 2)

    def test_empty_candidates_returns_empty_list(self):
        """Empty candidates list must return an empty list."""
        results = rank_vendors(
            consumer_lat=self.consumer_lat,
            consumer_lon=self.consumer_lon,
            candidates=[],
        )
        self.assertEqual(results, [])

    def test_api_recommend_endpoint_with_vendors_key(self):
        """Test POST /recommend endpoint using 'vendors' in payload."""
        payload = {
            "consumer_lat": 13.0418,
            "consumer_lon": 80.2341,
            "vendors": [
                {"vendor_id": "V1", "lat": 13.0420, "lon": 80.2345, "suitability_score": 0.85},
                {"vendor_id": "V2", "lat": 13.0900, "lon": 80.2800, "suitability_score": 0.90},
                {"vendor_id": "V3", "lat": 13.0419, "lon": 80.2342, "suitability_score": 0.95},
            ],
            "top_n": 2,
        }
        response = self.client.post("/recommend", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)

        # Check fields of each ranked vendor
        for item in data:
            self.assertIn("vendor_id", item)
            self.assertIn("distance_km", item)
            self.assertIn("suitability_score", item)
            self.assertIn("combined_score", item)
            self.assertIn("rank", item)

        # Check rankings
        self.assertEqual(data[0]["rank"], 1)
        self.assertEqual(data[1]["rank"], 2)
        self.assertGreaterEqual(data[0]["combined_score"], data[1]["combined_score"])

    def test_api_recommend_endpoint_with_candidates_alias(self):
        """Test POST /recommend endpoint using 'candidates' in payload."""
        payload = {
            "consumer_lat": 13.0418,
            "consumer_lon": 80.2341,
            "candidates": [
                {"vendor_id": "V1", "lat": 13.0420, "lon": 80.2345, "suitability_score": 0.85},
                {"vendor_id": "V2", "lat": 13.0900, "lon": 80.2800, "suitability_score": 0.90},
            ],
        }
        response = self.client.post("/recommend", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)


if __name__ == "__main__":
    unittest.main()
