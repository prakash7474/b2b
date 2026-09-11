"""
Unit tests for the Haversine distance algorithm in haversine.py.
"""

import unittest
import math
from haversine import haversine_distance_km, EARTH_RADIUS_KM


class TestHaversineDistance(unittest.TestCase):
    """Test suite for haversine_distance_km function."""

    def test_earth_radius_constant(self):
        """Earth's radius constant must be defined as 6371 km at the module level."""
        self.assertEqual(EARTH_RADIUS_KM, 6371)
        self.assertIsInstance(EARTH_RADIUS_KM, (int, float))

    def test_distance_between_identical_coordinates_returns_zero(self):
        """Distance between identical coordinates must return exactly 0.0."""
        test_points = [
            (0.0, 0.0),                     # Null Island (Equator / Prime Meridian)
            (13.0827, 80.2707),             # Chennai
            (-33.8688, 151.2093),           # Sydney
            (40.7128, -74.0060),            # New York City
            (90.0, 0.0),                    # North Pole
            (-90.0, 0.0),                   # South Pole
            (51.5074, -0.1278),             # London
            (-22.9068, -43.1729),           # Rio de Janeiro
        ]
        for lat, lon in test_points:
            with self.subTest(lat=lat, lon=lon):
                distance = haversine_distance_km(lat, lon, lat, lon)
                self.assertEqual(distance, 0.0)

    def test_distance_between_known_coordinate_pairs(self):
        """
        Distance between known pairs must match expected values within 0.1 km tolerance.
        """
        # London (51.5074, -0.1278) to Paris (48.8566, 2.3522)
        # Known great-circle distance with R=6371 km is ~343.56 km
        london_paris_dist = haversine_distance_km(51.5074, -0.1278, 48.8566, 2.3522)
        self.assertAlmostEqual(london_paris_dist, 343.56, delta=0.1)

        # New York City (40.7128, -74.0060) to London (51.5074, -0.1278)
        # Known great-circle distance with R=6371 km is ~5570.22 km
        nyc_london_dist = haversine_distance_km(40.7128, -74.0060, 51.5074, -0.1278)
        self.assertAlmostEqual(nyc_london_dist, 5570.22, delta=0.1)

        # Chennai (13.0827, 80.2707) to Bengaluru (12.9716, 77.5946)
        # Known great-circle distance with R=6371 km is ~290.13 km
        chennai_blr_dist = haversine_distance_km(13.0827, 80.2707, 12.9716, 77.5946)
        self.assertAlmostEqual(chennai_blr_dist, 290.13, delta=0.1)

    def test_coordinates_across_equator(self):
        """Correct handling of coordinates across the equator."""
        # 10 degrees North to 10 degrees South along meridian 20 degrees East
        # Total arc = 20 degrees = 20 * (pi / 180) * 6371 km = 2223.90 km
        expected_distance = 20.0 * (math.pi / 180.0) * EARTH_RADIUS_KM
        dist = haversine_distance_km(10.0, 20.0, -10.0, 20.0)
        self.assertAlmostEqual(dist, expected_distance, delta=0.1)
        self.assertAlmostEqual(dist, 2223.90, delta=0.1)

        # Near equator crossing: 0.5 degrees N to 0.5 degrees S at 0 longitude
        # Total arc = 1 degree = 1 * (pi / 180) * 6371 km = 111.19 km
        dist_small = haversine_distance_km(0.5, 0.0, -0.5, 0.0)
        self.assertAlmostEqual(dist_small, 111.19, delta=0.1)

    def test_coordinates_across_prime_meridian(self):
        """Correct handling of coordinates across the prime meridian (Greenwich)."""
        # 51.5 degrees N, 1 degree West to 51.5 degrees N, 1 degree East
        # Calculated great-circle distance with R=6371 km is 138.44 km
        dist = haversine_distance_km(51.5, -1.0, 51.5, 1.0)
        self.assertAlmostEqual(dist, 138.44, delta=0.1)

        # Along the Equator across Prime Meridian: 10 degrees W to 10 degrees E
        # Total arc = 20 degrees along equator = 2223.90 km
        dist_equator_pm = haversine_distance_km(0.0, -10.0, 0.0, 10.0)
        self.assertAlmostEqual(dist_equator_pm, 2223.90, delta=0.1)

    def test_coordinates_across_both_equator_and_prime_meridian(self):
        """Correct handling when crossing both the equator and the prime meridian."""
        # Point A in NW hemisphere (5.0 N, -5.0 W) to Point B in SE hemisphere (-5.0 S, 5.0 E)
        dist = haversine_distance_km(5.0, -5.0, -5.0, 5.0)
        self.assertAlmostEqual(dist, 1571.53, delta=0.1)

    def test_pure_function_properties(self):
        """Function must be pure: deterministic, symmetric, and without side-effects."""
        pt_a = (13.0827, 80.2707)
        pt_b = (12.9716, 77.5946)

        # Symmetry: distance(A, B) == distance(B, A)
        dist_ab = haversine_distance_km(pt_a[0], pt_a[1], pt_b[0], pt_b[1])
        dist_ba = haversine_distance_km(pt_b[0], pt_b[1], pt_a[0], pt_a[1])
        self.assertEqual(dist_ab, dist_ba)

        # Determinism / idempotency: repeated calls produce identical results
        for _ in range(50):
            self.assertEqual(
                haversine_distance_km(pt_a[0], pt_a[1], pt_b[0], pt_b[1]),
                dist_ab,
            )

        # Return type is float
        self.assertIsInstance(dist_ab, float)

        # Non-negativity
        self.assertGreaterEqual(dist_ab, 0.0)


if __name__ == "__main__":
    unittest.main()
