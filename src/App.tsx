import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth-context";
import RootLayout from "./routes/__root";
import HomePage from "./routes/index";
import ProductPage from "./routes/product";
import DevelopersPage from "./routes/developers";
import UseCasesPage from "./routes/use-cases";
import WaitlistPage from "./routes/waitlist";
import VoxaLayout from "./routes/voxa/__layout";
import VoxaLoginPage from "./routes/voxa/login";
import VoxaDashboard from "./routes/voxa/index";
import VoxaRoomPage from "./routes/voxa/room";
import VoxaProfilePage from "./routes/voxa/profile";
import VoxaSettingsPage from "./routes/voxa/settings";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<HomePage />} />
            <Route path="product" element={<ProductPage />} />
            <Route path="developers" element={<DevelopersPage />} />
            <Route path="use-cases" element={<UseCasesPage />} />
            <Route path="waitlist" element={<WaitlistPage />} />
            <Route path="*" element={<RootLayout />} />
          </Route>
          <Route path="voxa" element={<VoxaLayout />}>
            <Route path="login" element={<VoxaLoginPage />} />
            <Route index element={<VoxaDashboard />} />
            <Route path="room/:roomId" element={<VoxaRoomPage />} />
            <Route path="profile" element={<VoxaProfilePage />} />
            <Route path="settings" element={<VoxaSettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
