"""
Haversine distance calculation module for the B2P recommendation engine.

Calculates great-circle distance between two GPS coordinates on Earth.
"""

import math

# Earth's mean radius in kilometers
EARTH_RADIUS_KM = 6371


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance in kilometers between two GPS coordinates
    using the Haversine formula.

    This function is pure: it has no side effects, performs no I/O or database calls,
    and relies only on the standard library math module.

    Args:
        lat1: Latitude of the first coordinate in decimal degrees.
        lon1: Longitude of the first coordinate in decimal degrees.
        lat2: Latitude of the second coordinate in decimal degrees.
        lon2: Longitude of the second coordinate in decimal degrees.

    Returns:
        Great-circle distance in kilometers as a float.
    """
    # Convert latitude and longitude from decimal degrees to radians
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    # Haversine formula
    sin_half_dphi = math.sin(delta_phi / 2.0)
    sin_half_dlambda = math.sin(delta_lambda / 2.0)
    a = sin_half_dphi * sin_half_dphi + math.cos(phi1) * math.cos(phi2) * sin_half_dlambda * sin_half_dlambda

    # Clamp 'a' to [0.0, 1.0] to protect against floating-point inaccuracies
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return float(EARTH_RADIUS_KM * c)
