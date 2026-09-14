// Browser test double only. Never included in the application build.
import { createContext, useContext, useState } from "react";
const Context = createContext(null);
const state = (window.__privyFixture ||= JSON.parse(
  localStorage.getItem("privy-fixture") || "null",
) || { authenticated: false, wallet: null, created: 0 });
const save = () => localStorage.setItem("privy-fixture", JSON.stringify(state));
export function PrivyProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(state.authenticated);
  return (
    <Context.Provider
      value={{
        ready: true,
        authenticated,
        user: authenticated ? { id: "did:privy:browser-fixture" } : null,
        login() {
          state.authenticated = true;
          save();
          setAuthenticated(true);
        },
        async logout() {
          state.authenticated = false;
          save();
          setAuthenticated(false);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePrivy = () => useContext(Context);
export async function getAccessToken() {
  return state.authenticated ? "fixture-privy-token" : null;
}
export function useCreateWallet() {
  return {
    async createWallet(options) {
      if (options.createAdditional !== false) throw Error("additional wallet attempted");
      if (!state.wallet) {
        state.created++;
        state.wallet = "So11111111111111111111111111111111111111112";
        save();
      }
      return { wallet: { address: state.wallet } };
    },
  };
}
