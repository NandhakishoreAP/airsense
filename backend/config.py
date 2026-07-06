from dotenv import load_dotenv
import os

load_dotenv()

OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
WAQI_API_TOKEN = os.getenv("WAQI_API_TOKEN")

CITIES = {
    "Chennai": {"latitude": 13.0827, "longitude": 80.2707},
    "Delhi": {"latitude": 28.6139, "longitude": 77.2090},
    "Bengaluru": {"latitude": 12.9716, "longitude": 77.5946},
}

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "airsense.db")
