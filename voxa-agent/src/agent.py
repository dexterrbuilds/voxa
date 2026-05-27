import asyncio
import logging
import os

from dotenv import load_dotenv
from livekit.agents import AgentServer, JobContext, JobRequest, cli

load_dotenv(".env.local")
load_dotenv()

logger = logging.getLogger("voxa.nova")

NOVA_DISPATCH_NAME = os.getenv("LIVEKIT_AGENT_NAME", "nova")
NOVA_DISPLAY_NAME = "Nova"
NOVA_PARTICIPANT_IDENTITY = "agent:nova"

server = AgentServer()


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
    ctx.log_context_fields = {
        "agent": NOVA_DISPATCH_NAME,
        "room": ctx.room.name,
    }
    disconnected = asyncio.Event()

    @ctx.room.on("disconnected")
    def on_disconnected(*_: object) -> None:
        disconnected.set()

    logger.info("Nova dispatch accepted; connecting as a programmatic participant.")
    await ctx.connect()
    logger.info("Nova connected to room. Voice intelligence is intentionally not enabled yet.")

    # Presence-only MVP: keep the dispatched agent participant connected.
    # The next step replaces this with an AgentSession that wires STT, LLM, TTS, VAD,
    # interruption handling, and room event synchronization.
    await disconnected.wait()


if __name__ == "__main__":
    cli.run_app(server)
