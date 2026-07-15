import os
import sys
import google.generativeai as genai

# Add backend directory to Python path to import config cleanly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import config

genai.configure(api_key=config.GEMINI_API_KEY)


def list_models():
    try:
        model_list = genai.list_models()
        for m in model_list:
            if "generateContent" in m.supported_generation_methods:
                print(m.name)
    except Exception as e:
        print(f"Error listing models: {e}")


if __name__ == "__main__":
    list_models()
