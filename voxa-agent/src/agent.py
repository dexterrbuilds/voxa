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
NOVA_TTS_VOICE = os.getenv("NOVA_TTS_VOICE", "ash")

DIRECT_ADDRESS_PATTERN = re.compile(
    r"^\s*(?:hey|hi|hello|ok|okay|yo)?\s*,?\s*nova\b|^\s*nova\b",
    re.IGNORECASE,
)

server = AgentServer()


def directly_addresses_nova(text: str) -> bool:
    return bool(DIRECT_ADDRESS_PATTERN.search(text.strip()))


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

    async def on_user_turn_completed(
        self,
        turn_ctx: ChatContext,
        new_message: ChatMessage,
    ) -> None:
        del turn_ctx

        user_text = new_message.text_content or ""

        if self.mode == "silent":
            logger.info("Nova ignored user turn because room mode is silent.")
            raise StopResponse()

        if self.direct_address_required and not directly_addresses_nova(user_text):
            logger.info("Nova ignored user turn because it was not directly addressed.")
            raise StopResponse()


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
