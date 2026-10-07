import logging
import time

import google.generativeai as genai
import re

import config
from utils.time import resolve_weekday

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


def _build_prompt(question, city, current_aqi, forecast_aqi_24h=None, time_context="", aqi_context=None, forecast_context=None):
    forecast_text = (
        f"The 24-hour AQI forecast is {forecast_aqi_24h}."
        if forecast_aqi_24h is not None
        else "A 24-hour AQI forecast is not available for this request."
    )

    return (
        f"{time_context}\n\n"
        f"TRUSTED APPLICATION DATA: AQI context={aqi_context or 'not provided'}; forecast context={forecast_context or 'not provided'}.\n"
        f"You are a helpful, concise air quality assistant for {city}. "
        f"The current AQI is {current_aqi}. {forecast_text} "
        f"The citizen asks: {question} "
        "Answer directly and practically using the AQI context provided. "
        "If the question is about outdoor activity, exercise, health precautions, vulnerable groups, or what to do in the specified city, answer in 2-4 sentences using plain everyday language. "
        "If the question is unrelated to air quality, health, or the specified city, politely redirect the person back to air-quality-related questions in exactly 1 sentence instead of answering the unrelated question. "
        "Do not fabricate environmental measurements, timestamps, dates, weather conditions, or AQI values. If a value is not provided, say it is unavailable. "
        "Do not use markdown, do not repeat the question, and do not include generic disclaimers like 'I'm an AI'."
    )


def _deterministic_date_answer(question):
    lowered = question.lower()
    matches = re.findall(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", lowered)
    if not matches or not re.search(r"date|day|tomorrow|today", lowered):
        return None
    requested = matches[-1]
    target = resolve_weekday(requested)
    if target is None:
        return None
    return f"{requested.capitalize()} is {target.strftime('%B %-d, %Y')}."


def answer_citizen_question(question, city, current_aqi, forecast_aqi_24h=None, time_context="", aqi_context=None, forecast_context=None):
    """Answer a citizen question using AQI context and city-specific guidance."""
    deterministic = _deterministic_date_answer(question)
    prompt = _build_prompt(question, city, current_aqi, forecast_aqi_24h=forecast_aqi_24h, time_context=time_context, aqi_context=aqi_context, forecast_context=forecast_context)
    fallback_answer = deterministic or "Live language generation is temporarily unavailable. The requested environmental value is unavailable until the relevant source responds."

    date_only = deterministic and not re.search(r"\b(aqi|weather|walk|run|outside|forecast|pollution|safe)\b", question.lower())
    if date_only:
        return {"city": city, "question": question, "answer": deterministic, "source": "deterministic_application_logic"}

    try:
        model = _get_model()
        try:
            response = model.generate_content(prompt)
            answer_text = (response.text or "").strip()
            if not answer_text:
                raise ValueError("Gemini returned an empty chat response")
            logger.info("Citizen question answered from Gemini primary path for %s", city)
        except Exception as first_error:
            error_text = str(first_error).lower()
            if "429" in error_text or "quota" in error_text:
                logger.warning(
                    "Gemini rate-limit/quota error for chat in %s; retrying once in 5 seconds using fallback model %s: %s",
                    city,
                    FALLBACK_MODEL_NAME,
                    first_error,
                )
                try:
                    fallback_model = genai.GenerativeModel(FALLBACK_MODEL_NAME)
                    response = fallback_model.generate_content(prompt)
                    answer_text = (response.text or "").strip()
                    if not answer_text:
                        raise ValueError("Gemini returned an empty chat response")
                    logger.info("Citizen question answered on retry using fallback model %s for %s", FALLBACK_MODEL_NAME, city)
                except Exception as retry_error:
                    error_text_retry = str(retry_error).lower()
                    if "429" in error_text_retry or "quota" in error_text_retry:
                        logger.warning(
                            "Gemini retry also hit rate-limit/quota for chat in %s; using fallback message: %s",
                            city,
                            retry_error,
                        )
                    else:
                        logger.warning(
                            "Gemini retry failed for chat in %s; using fallback message: %s",
                            city,
                            retry_error,
                        )
                    raise retry_error
            else:
                raise first_error

        return {
            "city": city,
            "question": question,
            "answer": answer_text,
            "source": "gemini",
        }
    except Exception as exc:
        logger.warning("Citizen question answering failed for %s: %s", city, exc)
        return {
            "city": city,
            "question": question,
            "answer": fallback_answer,
            "error": True,
        }


if __name__ == "__main__":
    example_1 = answer_citizen_question(
        question="Is it safe to go for a run this evening?",
        city="Delhi",
        current_aqi=220,
        forecast_aqi_24h=195,
    )
    print(example_1)

    example_2 = answer_citizen_question(
        question="What's the capital of France?",
        city="Delhi",
        current_aqi=220,
        forecast_aqi_24h=195,
    )
    print(example_2)
