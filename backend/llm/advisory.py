import logging
import time
from typing import Dict, List

import google.generativeai as genai

import config

logger = logging.getLogger(__name__)

# Prefer the newer Flash model first; if Google renames/deprecates it, update here.
PRIMARY_MODEL_NAME = "gemini-flash-latest"
FALLBACK_MODEL_NAME = "gemini-flash-lite-latest"

genai.configure(api_key=config.GEMINI_API_KEY)


def _get_model():
    """Return the preferred Gemini model, falling back if needed."""
    try:
        return genai.GenerativeModel(PRIMARY_MODEL_NAME)
    except Exception as primary_error:
        logger.warning(
            "Primary Gemini model %s unavailable, falling back to %s: %s",
            PRIMARY_MODEL_NAME,
            FALLBACK_MODEL_NAME,
            primary_error,
        )
        return genai.GenerativeModel(FALLBACK_MODEL_NAME)


def generate_health_advisory(city, aqi_value, language="English"):
    """Generate a short practical health advisory for a city and AQI value."""
    prompt = (
        f"You are a public health communicator writing for residents of {city}. "
        f"The current or forecast AQI is {aqi_value}. "
        f"Write a short, practical health advisory in {language}. "
        "Keep it to 2-3 sentences. Explain whether outdoor activity or exercise is advisable, "
        "and include specific guidance for vulnerable groups such as people with respiratory conditions, "
        "older adults, and children. Use clear everyday language. "
        "Respond with ONLY the advisory text. Do not add a title, preamble, markdown, bullet points, "
        "or any explanation of your instructions. Do not repeat the question."
    )

    fallback_message = (
        "Health advisory temporarily unavailable. Please check official AQI resources for guidance."
    )

    try:
        model = _get_model()
        try:
            response = model.generate_content(prompt)
            advisory_text = (response.text or "").strip()
            if not advisory_text:
                raise ValueError("Gemini returned an empty advisory response")
            logger.info("Health advisory generated from Gemini primary path for %s (%s)", city, language)
        except Exception as first_error:
            error_text = str(first_error).lower()
            if "429" in error_text or "quota" in error_text:
                logger.warning(
                    "Gemini rate-limit/quota error for %s (%s); retrying once in 5 seconds using fallback model %s: %s",
                    city,
                    language,
                    FALLBACK_MODEL_NAME,
                    first_error,
                )
                time.sleep(5)
                try:
                    fallback_model = genai.GenerativeModel(FALLBACK_MODEL_NAME)
                    response = fallback_model.generate_content(prompt)
                    advisory_text = (response.text or "").strip()
                    if not advisory_text:
                        raise ValueError("Gemini returned an empty advisory response")
                    logger.info("Health advisory generated on retry using fallback model %s for %s (%s)", FALLBACK_MODEL_NAME, city, language)
                except Exception as retry_error:
                    error_text_retry = str(retry_error).lower()
                    if "429" in error_text_retry or "quota" in error_text_retry:
                        logger.warning(
                            "Gemini retry also hit rate-limit/quota for %s (%s); using fallback message: %s",
                            city,
                            language,
                            retry_error,
                        )
                    else:
                        logger.warning(
                            "Gemini retry failed for %s (%s); using fallback message: %s",
                            city,
                            language,
                            retry_error,
                        )
                    raise retry_error
            else:
                raise first_error

        return {
            "city": city,
            "aqi_value": aqi_value,
            "language": language,
            "advisory_text": advisory_text,
        }
    except Exception as exc:
        logger.warning("Health advisory generation failed for %s (%s): %s", city, language, exc)
        return {
            "city": city,
            "aqi_value": aqi_value,
            "language": language,
            "advisory_text": fallback_message,
            "error": True,
        }


def generate_multilingual_advisory(city, aqi_value, languages=["English", "Tamil", "Hindi"]):
    """Generate advisories for multiple languages and return them keyed by language."""
    advisories: Dict[str, dict] = {}
    for language in languages:
        advisories[language] = generate_health_advisory(city, aqi_value, language=language)
    return advisories


if __name__ == "__main__":
    example = generate_multilingual_advisory("Chennai", 180)
    print(example)
