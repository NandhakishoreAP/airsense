import logging
import time
from typing import Dict, List, Optional

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


def _build_prompt(
    city,
    aqi_value,
    wind_speed=None,
    wind_direction=None,
    nearby_site_count=None,
    nearby_site_types=None,
):
    site_types_text = ", ".join(nearby_site_types) if nearby_site_types else "not provided"
    wind_speed_text = f"{wind_speed} m/s" if wind_speed is not None else "not provided"
    wind_direction_text = f"{wind_direction} degrees" if wind_direction is not None else "not provided"
    nearby_site_count_text = str(nearby_site_count) if nearby_site_count is not None else "not provided"

    return (
        f"You are an air quality analyst helping explain likely causes of current pollution in {city}. "
        f"The current AQI is {aqi_value}. "
        f"Context available: wind speed is {wind_speed_text}, wind direction is {wind_direction_text}, "
        f"and nearby vulnerable-site count is {nearby_site_count_text}. "
        f"Nearby site types reported are: {site_types_text}. "
        "Important: the nearby vulnerable-site count is only a rough proxy for local urban density and activity; "
        "it is not direct traffic, fuel, stack-emissions, or industrial permit data. "
        "Reason about the most likely contributing factor or factors to the current pollution level using only general categories such as traffic density, low wind dispersal, urban congestion, or seasonal / meteorological factors. "
        "Write 2-3 concise sentences explaining your reasoning. "
        "End your response with exactly one final line in this format: Confidence: Low, Confidence: Moderate, or Confidence: High. "
        "Base the confidence level on how much relevant context was actually provided; if wind data is missing or sparse, lower the confidence. "
        "Respond with ONLY the reasoning text followed by the confidence line. Do not add markdown, headings, bullets, or any extra commentary."
    )


def _parse_reasoning_and_confidence(text: str):
    """Split model output into reasoning text and confidence label."""
    if not text:
        return "", "Unknown"

    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return "", "Unknown"

    confidence = "Unknown"
    if lines[-1].lower().startswith("confidence:"):
        confidence_value = lines[-1].split(":", 1)[1].strip()
        confidence_map = {"low": "Low", "moderate": "Moderate", "high": "High"}
        confidence = confidence_map.get(confidence_value.lower(), "Unknown")
        reasoning_lines = lines[:-1]
    else:
        reasoning_lines = lines

    reasoning = " ".join(reasoning_lines).strip()
    return reasoning, confidence


def generate_source_attribution(
    city,
    aqi_value,
    wind_speed=None,
    wind_direction=None,
    nearby_site_count=None,
    nearby_site_types=None,
):
    """Generate a short source-attribution explanation and confidence label."""
    prompt = _build_prompt(
        city,
        aqi_value,
        wind_speed=wind_speed,
        wind_direction=wind_direction,
        nearby_site_count=nearby_site_count,
        nearby_site_types=nearby_site_types,
    )

    fallback_message = "Source attribution temporarily unavailable."

    try:
        model = _get_model()
        try:
            response = model.generate_content(prompt)
            raw_text = (response.text or "").strip()
            if not raw_text:
                raise ValueError("Gemini returned an empty attribution response")
            reasoning, confidence = _parse_reasoning_and_confidence(raw_text)
            logger.info("Source attribution generated from Gemini primary path for %s", city)
        except Exception as first_error:
            error_text = str(first_error).lower()
            if "429" in error_text or "quota" in error_text:
                logger.warning(
                    "Gemini rate-limit/quota error for source attribution in %s; retrying once in 5 seconds using fallback model %s: %s",
                    city,
                    FALLBACK_MODEL_NAME,
                    first_error,
                )
                time.sleep(5)
                try:
                    fallback_model = genai.GenerativeModel(FALLBACK_MODEL_NAME)
                    response = fallback_model.generate_content(prompt)
                    raw_text = (response.text or "").strip()
                    if not raw_text:
                        raise ValueError("Gemini returned an empty attribution response")
                    reasoning, confidence = _parse_reasoning_and_confidence(raw_text)
                    logger.info("Source attribution generated on retry using fallback model %s for %s", FALLBACK_MODEL_NAME, city)
                except Exception as retry_error:
                    error_text_retry = str(retry_error).lower()
                    if "429" in error_text_retry or "quota" in error_text_retry:
                        logger.warning(
                            "Gemini retry also hit rate-limit/quota for source attribution in %s; using fallback message: %s",
                            city,
                            retry_error,
                        )
                    else:
                        logger.warning(
                            "Gemini retry failed for source attribution in %s; using fallback message: %s",
                            city,
                            retry_error,
                        )
                    raise retry_error
            else:
                raise first_error

        return {
            "city": city,
            "aqi_value": aqi_value,
            "reasoning": reasoning,
            "confidence": confidence,
        }
    except Exception as exc:
        logger.warning("Source attribution generation failed for %s: %s", city, exc)
        return {
            "city": city,
            "aqi_value": aqi_value,
            "reasoning": fallback_message,
            "confidence": "Unknown",
            "error": True,
        }


if __name__ == "__main__":
    example = generate_source_attribution(
        city="Delhi",
        aqi_value=220,
        wind_speed=2.1,
        wind_direction=180,
        nearby_site_count=45,
        nearby_site_types=["school", "hospital"],
    )
    print(example)
