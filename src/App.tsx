import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootLayout from "./routes/__root";
import { SubdomainProvider } from "./contexts/SubdomainContext";

const HomePage = lazy(() => import("./routes/index"));
const ProductPage = lazy(() => import("./routes/product"));
const DevelopersPage = lazy(() => import("./routes/developers"));
const DeveloperAccessPage = lazy(() => import("./routes/developers-access"));
const DeveloperDocsPage = lazy(() => import("./routes/developers-docs"));
const UseCasesPage = lazy(() => import("./routes/use-cases"));
const WaitlistPage = lazy(() => import("./routes/waitlist"));

function RouteFallback() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center bg-background px-6 pt-16 text-foreground">
      <div className="glass rounded-xl px-4 py-2 text-sm text-muted-foreground">Loading Voxa</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SubdomainProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<RootLayout />}>
              <Route index element={<HomePage />} />
              <Route path="product" element={<ProductPage />} />
              <Route path="developers" element={<DevelopersPage />} />
              <Route path="developers/access" element={<DeveloperAccessPage />} />
              <Route path="developers/docs/*" element={<DeveloperDocsPage />} />
              <Route path="use-cases" element={<UseCasesPage />} />
              <Route path="waitlist" element={<WaitlistPage />} />
              <Route path="*" element={<RootLayout />} />
            </Route>
          </Routes>
        </Suspense>
      </SubdomainProvider>
    </BrowserRouter>
  );
}
