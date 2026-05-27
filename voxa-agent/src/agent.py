import asyncio
import json
import logging
import os
import re

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ChatMessage,
    JobContext,
    JobRequest,
    StopResponse,
    cli,
)
from livekit.plugins import google

load_dotenv(".env.local")
load_dotenv()

logger = logging.getLogger("voxa.nova")

NOVA_DISPATCH_NAME = os.getenv("LIVEKIT_AGENT_NAME", "nova")
NOVA_DISPLAY_NAME = "Nova"
NOVA_PARTICIPANT_IDENTITY = "agent:nova"
NOVA_DEFAULT_MODE = "manual"
NOVA_WAKE_WORD = os.getenv("NOVA_WAKE_WORD", "Nova")
NOVA_GEMINI_MODEL = os.getenv("NOVA_GEMINI_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")
NOVA_GEMINI_VOICE = os.getenv("NOVA_GEMINI_VOICE", "Kore")
NOVA_GEMINI_TEMPERATURE = float(os.getenv("NOVA_GEMINI_TEMPERATURE", "0.8"))
NOVA_ENABLE_GOOGLE_SEARCH = os.getenv("NOVA_ENABLE_GOOGLE_SEARCH", "true").lower() == "true"

DIRECT_ADDRESS_PATTERN = re.compile(
    r"^\s*(?:hey|hi|hello|ok|okay|yo)?\s*,?\s*nova\b|^\s*nova\b",
    re.IGNORECASE,
)

server = AgentServer()


def directly_addresses_nova(text: str) -> bool:
    return bool(DIRECT_ADDRESS_PATTERN.search(text.strip()))


def message_role(item: object) -> str:
    return str(getattr(item, "role", "unknown"))


def message_text(item: object) -> str:
    return str(getattr(item, "text_content", "") or "")


def google_search_tools() -> list[object]:
    if not NOVA_ENABLE_GOOGLE_SEARCH:
        return []

    try:
        return [google.tools.GoogleSearch()]
    except Exception:
        logger.exception("Google Search grounding tool is unavailable in this plugin version.")
        return []


def gemini_realtime_model() -> object:
    instructions = (
        "You are Nova, Voxa's first AI room participant. "
        "You are calm, concise, intelligent, warm, modern, and conversational. "
        "You are in a private LiveKit voice room. "
        "The browser only sends microphone audio after the local wake word activates, "
        "so if audio reaches you, assume the user intentionally wants Nova. "
        "Answer quickly and naturally. Keep responses short by default. "
        "Do not dominate the room. Do not speak unprompted."
    )

    realtime = getattr(google, "realtime", None)
    if realtime and hasattr(realtime, "RealtimeModel"):
        return realtime.RealtimeModel(
            model=NOVA_GEMINI_MODEL,
            voice=NOVA_GEMINI_VOICE,
            temperature=NOVA_GEMINI_TEMPERATURE,
            instructions=instructions,
        )

    beta_model = getattr(google, "BetaRealtimeModel", None)
    if beta_model:
        return beta_model(
            model=NOVA_GEMINI_MODEL,
            voice=NOVA_GEMINI_VOICE,
            temperature=NOVA_GEMINI_TEMPERATURE,
            instructions=instructions,
        )

    raise RuntimeError("LiveKit Google realtime model is unavailable. Install livekit-agents[google].")


class NovaAgent(Agent):
    def __init__(self, *, mode: str, direct_address_required: bool) -> None:
        self.mode = mode
        self.direct_address_required = direct_address_required
        super().__init__(
            instructions=(
                "You are Nova. Use a clear, concise, feminine, modern assistant persona. "
                "The browser gates audio with a local wake word. "
                "If you receive audio, respond as if the user intentionally activated Nova."
            ),
            tools=google_search_tools(),
        )

    async def on_enter(self) -> None:
        logger.info("Nova Gemini Live session started in %s mode.", self.mode)

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: ChatMessage,
    ) -> None:
        del turn_ctx

        user_text = new_message.text_content or ""

        if self.mode == "silent":
            logger.info("Nova ignored user turn because room mode is silent: %r", user_text)
            raise StopResponse()

        # With frontend wake-word activation, direct addressing is handled locally before audio
        # reaches Gemini. This transcript gate remains as a defensive fallback if text is present.
        if user_text and self.direct_address_required and not directly_addresses_nova(user_text):
            logger.info(
                "Nova received non-addressed transcript after wake gate; allowing because frontend "
                "activation is source of truth: %r",
                user_text,
            )


async def accept_nova_request(req: JobRequest) -> None:
    await req.accept(
        name=NOVA_DISPLAY_NAME,
        identity=NOVA_PARTICIPANT_IDENTITY,
        attributes={
            "agent_id": "nova",
            "participant_type": "agent",
            "product": "voxa",
        },
    )


@server.rtc_session(agent_name=NOVA_DISPATCH_NAME, on_request=accept_nova_request)
async def nova_agent(ctx: JobContext) -> None:
    metadata = {}
    if ctx.job.metadata:
        try:
            metadata = json.loads(ctx.job.metadata)
        except json.JSONDecodeError:
            logger.warning("Nova received non-JSON dispatch metadata: %s", ctx.job.metadata)

    mode = metadata.get("mode", NOVA_DEFAULT_MODE)
    if mode not in {"manual", "silent"}:
        mode = NOVA_DEFAULT_MODE
    direct_address_required = bool(metadata.get("direct_address_required", mode == "manual"))

    ctx.log_context_fields = {
        "agent": NOVA_DISPATCH_NAME,
        "mode": mode,
        "room": ctx.room.name,
    }
    disconnected = asyncio.Event()

    @ctx.room.on("disconnected")
    def on_disconnected(*_: object) -> None:
        disconnected.set()

    logger.info("Nova dispatch accepted; starting Gemini Live realtime session.")
    logger.info(
        "Nova Gemini config model=%s voice=%s temperature=%s google_key_present=%s search=%s",
        NOVA_GEMINI_MODEL,
        NOVA_GEMINI_VOICE,
        NOVA_GEMINI_TEMPERATURE,
        bool(os.getenv("GOOGLE_API_KEY")),
        NOVA_ENABLE_GOOGLE_SEARCH,
    )

    session = AgentSession(
        llm=gemini_realtime_model(),
    )

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event: object) -> None:
        logger.info(
            "Nova Gemini transcript final=%s speaker=%s language=%s transcript=%r",
            getattr(event, "is_final", None),
            getattr(event, "speaker_id", None),
            getattr(event, "language", None),
            getattr(event, "transcript", ""),
        )

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: object) -> None:
        item = getattr(event, "item", None)
        logger.info("Nova conversation item role=%s text=%r", message_role(item), message_text(item))

    @session.on("agent_state_changed")
    def on_agent_state_changed(event: object) -> None:
        logger.info(
            "Nova agent state changed old=%s new=%s",
            getattr(event, "old_state", None),
            getattr(event, "new_state", None),
        )

    @session.on("speech_created")
    def on_speech_created(event: object) -> None:
        logger.info("Nova Gemini speech created: %s", event)

    @session.on("error")
    def on_agent_error(event: object) -> None:
        logger.error(
            "Nova Gemini session error error=%r recoverable=%s source=%s",
            getattr(event, "error", None),
            getattr(event, "recoverable", None),
            getattr(event, "source", None),
        )

    @session.on("close")
    def on_agent_close(event: object) -> None:
        logger.info("Nova Gemini session closed: %s", event)

    await session.start(
        room=ctx.room,
        agent=NovaAgent(mode=mode, direct_address_required=direct_address_required),
    )

    logger.info(
        "Nova connected to room with Gemini Live. mode=%s wake_word=%s",
        mode,
        NOVA_WAKE_WORD,
    )

    await disconnected.wait()


if __name__ == "__main__":
    cli.run_app(server)
