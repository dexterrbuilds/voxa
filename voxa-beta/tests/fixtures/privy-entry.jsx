import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../../app/components/ThemeProvider";
import Nova from "../../app/nova/page";
import Login from "../../app/components/identity/PrivyLogin";
function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return <ThemeProvider>{path === "/nova" ? <Nova /> : <Login />}</ThemeProvider>;
}
createRoot(document.getElementById("root")).render(<App />);
