PRODUCT_NAME_TO_ID = {
    "Idli Batter": "Idly_Batter",
    "Dosa Batter": "Dosa_Batter",
    "Combo Pack": "Combo_Pack",
    "Rava Batter": "Dosa_Batter",
    "Idly_Batter": "Idly_Batter",
    "Dosa_Batter": "Dosa_Batter",
    "Combo_Pack": "Combo_Pack",
}

STORAGE_TYPE_MAP = {
    "refrigerated": "fridge",
    "fridge": "fridge",
    "ambient_cool": "counter",
    "counter": "counter",
    "room_temp": "backroom",
    "backroom": "backroom",
}

FESTIVAL_MAP = {
    "none": "none",
    "diwali": "publicHoliday",
    "publicHoliday": "publicHoliday",
    "harvestFestival": "harvestFestival",
}


def safe_encode(encoder, value, known_labels):
    if value in known_labels:
        return int(encoder.transform([value])[0])
    return 0
