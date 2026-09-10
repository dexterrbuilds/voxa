import { Outlet } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function VoxaLayout() {
  return (
    <>
      <Helmet>
        <title>Synq - AI Voice Conversations</title>
        <meta name="description" content="Real-time voice conversations with AI personalities" />
      </Helmet>
      <div className="min-h-screen bg-background text-foreground">
        <Outlet />
      </div>
    </>
  );
}
