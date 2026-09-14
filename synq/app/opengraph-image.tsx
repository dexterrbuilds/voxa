import { ImageResponse } from "next/og";

export const alt = "Synq. Humans and agents. In conversation.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function SocialImage() {
  return new ImageResponse(
    <div
      style={{
        background: "#101614",
        color: "#ecf3ef",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 90,
        width: "100%",
        height: "100%",
      }}
    >
      <div style={{ color: "#74dfbd", fontSize: 108, fontWeight: 700 }}>Synq</div>
      <div style={{ fontSize: 52, marginTop: 36 }}>Humans and agents. In conversation.</div>
      <div style={{ fontSize: 28, color: "#a3b6ac", marginTop: 24 }}>
        A shared space for real-time connection.
      </div>
    </div>,
    size,
  );
}
