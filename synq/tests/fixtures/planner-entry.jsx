import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CapabilityPlanCard } from "../../app/components/CapabilityPlanCard";
import { ThemeProvider } from "../../app/components/ThemeProvider";
import { ThemeToggle } from "../../app/components/ThemeToggle";
function Preview() {
  const [show, setShow] = useState(false);
  return (
    <ThemeProvider>
      <main className="glacier-world min-h-screen p-4 sm:p-8">
        <ThemeToggle />
        <h1 className="text-xl my-4">Nova planning fixture</h1>
        <button className="nova-primary" onClick={() => setShow(true)}>
          Show example plan
        </button>
        {show && (
          <div className="max-w-2xl mx-auto my-6">
            <CapabilityPlanCard plan={window.__planningFixture} />
          </div>
        )}
      </main>
    </ThemeProvider>
  );
}
createRoot(document.getElementById("root")).render(<Preview />);
