"""
Test script: read input.json, load model from MongoDB, run predictions.
"""

import os
import json
import numpy as np
from model_loader import load_model


def main():
    # Load model from MongoDB Atlas
    print("Connecting to MongoDB Atlas...")
    model = load_model()
    print()

    # Read input.json
    input_path = os.path.join(os.path.dirname(__file__), "input.json")
    print(f"Reading {input_path}...")
    with open(input_path, "r") as f:
        data = json.load(f)

    test_cases = data.get("test_cases", [])
    print(f"Found {len(test_cases)} test cases")
    print("=" * 70)

    pass_count = 0
    fail_count = 0

    for tc in test_cases:
        tc_id = tc["id"]
        desc = tc["description"]
        features = tc["features"]
        expected = tc.get("expected_risk", "N/A")

        # Map input field names to model feature names
        # input.json uses "storage_temp_c" but model expects "storage_temp"
        X = np.array(
            [[
                features["hours_since_mfg"],
                features["storage_temp_c"],
                features["sell_through_rate"],
            ]]
        )

        prediction = model.predict(X)[0]
        proba = model.predict_proba(X)[0]
        classes = list(model.classes_)
        confidence = {cls: round(float(prob), 4) for cls, prob in zip(classes, proba)}

        match = "[PASS]" if prediction == expected else "[FAIL]"
        if prediction == expected:
            pass_count += 1
        else:
            fail_count += 1

        print(f"\nTest Case #{tc_id}: {desc}")
        print(f"  Input: hours={features['hours_since_mfg']}, "
              f"temp={features['storage_temp_c']}C, "
              f"sell_rate={features['sell_through_rate']}")
        print(f"  Expected: {expected}")
        print(f"  Predicted: {prediction} {match}")
        print(f"  Confidence: {confidence}")

    print("\n" + "=" * 70)
    print(f"Results: {pass_count} passed, {fail_count} failed out of {len(test_cases)}")


if __name__ == "__main__":
    main()
