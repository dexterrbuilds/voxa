import asyncio
import json
import logging
import os
import re
from typing import AsyncIterable

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ChatMessage,
    FunctionTool,
    JobContext,
    JobRequest,
    ModelSettings,
    StopResponse,
    cli,
    llm,
)
from livekit.agents import stt as agents_stt
from livekit.plugins import openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv(".env.local")
load_dotenv()

logger = logging.getLogger("voxa.nova")

NOVA_DISPATCH_NAME = os.getenv("LIVEKIT_AGENT_NAME", "nova")
NOVA_DISPLAY_NAME = "Nova"
NOVA_PARTICIPANT_IDENTITY = "agent:nova"
NOVA_DEFAULT_MODE = "manual"
NOVA_WAKE_WORD = "nova"
NOVA_STT_MODEL = os.getenv("NOVA_STT_MODEL", "gpt-4o-mini-transcribe")
NOVA_LLM_MODEL = os.getenv("NOVA_LLM_MODEL", "gpt-4.1-mini")
NOVA_TTS_MODEL = os.getenv("NOVA_TTS_MODEL", "gpt-4o-mini-tts")
NOVA_TTS_VOICE = os.getenv("NOVA_TTS_VOICE", "coral")

DIRECT_ADDRESS_PATTERN = re.compile(
    r"^\s*(?:hey|hi|hello|ok|okay|yo)?\s*,?\s*nova\b|^\s*nova\b",
    re.IGNORECASE,
)

server = AgentServer()


def directly_addresses_nova(text: str) -> bool:
    return bool(DIRECT_ADDRESS_PATTERN.search(text.strip()))


def chunk_text(chunk: object) -> str:
    delta = getattr(chunk, "delta", None)
    content = getattr(delta, "content", None)

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        return "".join(str(part) for part in content if part)

    return ""


def message_role(item: object) -> str:
    return str(getattr(item, "role", "unknown"))


def message_text(item: object) -> str:
    return str(getattr(item, "text_content", "") or "")


class NovaAgent(Agent):
    def __init__(self, *, mode: str, direct_address_required: bool) -> None:
        self.mode = mode
        self.direct_address_required = direct_address_required
        super().__init__(
            instructions=(
                "You are Nova, Voxa's first AI room participant. "
                "You are calm, concise, intelligent, helpful, conversational, and present. "
                "You are in a live voice room with humans. "
                "Keep responses short unless the user asks for depth. "
                "Do not dominate the room. Do not speak unless directly addressed by name. "
                "If a user addresses you as Nova, answer naturally and briefly."
            ),
        )

    async def on_enter(self) -> None:
        logger.info("Nova agent session started in %s mode.", self.mode)

    async def stt_node(
        self,
        audio: AsyncIterable[rtc.AudioFrame],
        model_settings: ModelSettings,
    ) -> AsyncIterable[agents_stt.SpeechEvent] | None:
        logger.info("Nova STT start.")
        events = Agent.default.stt_node(self, audio, model_settings)

        if events is None:
            logger.error("Nova STT returned no event stream.")
            return

        try:
            async for event in events:
                alternatives = getattr(event, "alternatives", None) or []
                transcript = ""
                if alternatives:
                    transcript = str(getattr(alternatives[0], "text", "") or "")
                event_type = getattr(event, "type", "unknown")

                if transcript:
                    logger.info("Nova STT event type=%s transcript=%r", event_type, transcript)
                else:
                    logger.debug("Nova STT event type=%s with no transcript yet.", event_type)

                yield event
        except Exception:
            logger.exception("Nova STT failed.")
            raise
        finally:
            logger.info("Nova STT end.")

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: ChatMessage,
    ) -> None:
        del turn_ctx

        user_text = new_message.text_content or ""

        if self.mode == "silent":
            logger.info("Nova transcript received but ignored because room mode is silent: %r", user_text)
            raise StopResponse()

        if self.direct_address_required and not directly_addresses_nova(user_text):
            logger.info("Nova transcript received but ignored because it was not directly addressed: %r", user_text)
            raise StopResponse()

        logger.info("Nova accepted addressed turn: %r", user_text)

    async def llm_node(
        self,
        chat_ctx: llm.ChatContext,
        tools: list[FunctionTool],
        model_settings: ModelSettings,
    ) -> AsyncIterable[llm.ChatChunk]:
        logger.info("Nova LLM request start.")
        response_parts: list[str] = []

        try:
            async for chunk in Agent.default.llm_node(self, chat_ctx, tools, model_settings):
                text = chunk_text(chunk)
                if text:
                    response_parts.append(text)
                    logger.debug("Nova LLM delta: %r", text)
                yield chunk
        except Exception:
            logger.exception("Nova LLM failed.")
            raise
        finally:
            response_text = "".join(response_parts).strip()
            if response_text:
                logger.info("Nova LLM response text: %r", response_text)
            else:
                logger.warning("Nova LLM ended without response text.")

    async def tts_node(
        self,
        text: AsyncIterable[str],
        model_settings: ModelSettings,
    ) -> AsyncIterable[rtc.AudioFrame]:
        logger.info("Nova TTS start.")
        text_parts: list[str] = []
        frame_count = 0

        async def logged_text() -> AsyncIterable[str]:
            async for segment in text:
                if segment:
                    text_parts.append(segment)
                    logger.info("Nova TTS input text chunk: %r", segment)
                yield segment

        try:
            async for frame in Agent.default.tts_node(self, logged_text(), model_settings):
                frame_count += 1
                if frame_count == 1:
                    logger.info("Nova TTS produced first audio frame; publishing output audio.")
                yield frame
        except Exception:
            logger.exception("Nova TTS/audio publish failed.")
            raise
        finally:
            logger.info(
                "Nova TTS end. input=%r audio_frames=%s",
                "".join(text_parts).strip(),
                frame_count,
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

    logger.info("Nova dispatch accepted; starting guarded voice pipeline.")
    logger.info(
        "Nova model config stt=%s llm=%s tts=%s voice=%s openai_key_present=%s",
        NOVA_STT_MODEL,
        NOVA_LLM_MODEL,
        NOVA_TTS_MODEL,
        NOVA_TTS_VOICE,
        bool(os.getenv("OPENAI_API_KEY")),
    )

    session = AgentSession(
        stt=openai.STT(model=NOVA_STT_MODEL),
        llm=openai.responses.LLM(model=NOVA_LLM_MODEL),
        tts=openai.TTS(
            model=NOVA_TTS_MODEL,
            voice=NOVA_TTS_VOICE,
            instructions="Speak calmly, clearly, and briefly with a premium cinematic tone.",
        ),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event: object) -> None:
        logger.info(
            "Nova transcript event final=%s speaker=%s language=%s transcript=%r",
            getattr(event, "is_final", None),
            getattr(event, "speaker_id", None),
            getattr(event, "language", None),
            getattr(event, "transcript", ""),
        )

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: object) -> None:
        item = getattr(event, "item", None)
        logger.info(
            "Nova conversation item role=%s text=%r",
            message_role(item),
            message_text(item),
        )

    @session.on("speech_created")
    def on_speech_created(event: object) -> None:
        logger.info("Nova speech created: %s", event)

    @session.on("agent_state_changed")
    def on_agent_state_changed(event: object) -> None:
        logger.info(
            "Nova agent state changed old=%s new=%s",
            getattr(event, "old_state", None),
            getattr(event, "new_state", None),
        )

    @session.on("user_state_changed")
    def on_user_state_changed(event: object) -> None:
        logger.info(
            "Nova user state changed old=%s new=%s",
            getattr(event, "old_state", None),
            getattr(event, "new_state", None),
        )

    @session.on("error")
    def on_agent_error(event: object) -> None:
        logger.error(
            "Nova session error error=%r recoverable=%s source=%s",
            getattr(event, "error", None),
            getattr(event, "recoverable", None),
            getattr(event, "source", None),
        )

    @session.on("close")
    def on_agent_close(event: object) -> None:
        logger.info("Nova session closed: %s", event)

    await session.start(
        room=ctx.room,
        agent=NovaAgent(mode=mode, direct_address_required=direct_address_required),
    )

    logger.info(
        "Nova connected to room with guarded voice intelligence. "
        "Mode=%s direct_address_required=%s wake_word=%s",
        mode,
        direct_address_required,
        NOVA_WAKE_WORD,
    )

    await disconnected.wait()


if __name__ == "__main__":
    cli.run_app(server)
