import { useEffect, useRef, useState } from "react";
import { isAppPageKey, type AppPageKey } from "../app/pageRegistry";
import { readSessionStore, writeSessionStore } from "../utils/sessionStore";

const PAGE_SESSION_KEY = "player_web_active_page_session_v1";

export function usePageNavigation(authenticated: boolean, username: string) {
  const [activePage, setActivePage] = useState<AppPageKey>("radar");
  const restoredAccount = useRef("");

  useEffect(() => {
    if (!authenticated) {
      restoredAccount.current = "";
      return;
    }
    if (restoredAccount.current !== username) {
      const stored = readSessionStore(PAGE_SESSION_KEY, "radar");
      const page = typeof stored === "string" && isAppPageKey(stored) ? stored : "radar";
      restoredAccount.current = username;
      setActivePage(page);
      return;
    }
    writeSessionStore(PAGE_SESSION_KEY, activePage);
  }, [authenticated, username, activePage]);

  return { activePage, setActivePage };
}
