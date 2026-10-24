import { createContext, useContext } from "react";

export interface TokenContextValue {
  getToken: () => Promise<string | null>;
  userName: string | null;
}

export const TokenContext = createContext<TokenContextValue>({
  getToken: async () => null,
  userName: null,
});

export function useAccessToken(): TokenContextValue {
  return useContext(TokenContext);
}
