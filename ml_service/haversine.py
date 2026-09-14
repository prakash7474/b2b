"""
Haversine distance calculation module for the B2P recommendation engine.
Re-exports from the canonical implementation in the project root.
"""

import sys
import os

# Add project root to path to import the canonical haversine module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from haversine import EARTH_RADIUS_KM, haversine_distance_km

__all__ = ["EARTH_RADIUS_KM", "haversine_distance_km"]
