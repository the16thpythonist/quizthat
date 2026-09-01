"""Text-to-speech integration (ElevenLabs)."""

from .client import (
    TIER_PRICING,
    TTSResult,
    estimate_cost,
    generate_all_voice_lines,
    generate_voice_lines,
    get_subscription_info,
    has_api_key,
    load_voice_config,
)
