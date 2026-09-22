import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { rememberDestination, DEFAULT_DESTINATION } from "./pending-destination";

/**
 * The single owner of web authentication state.
 *
 * One session read at startup, one subscription for the whole application, and
 * one explicit state machine:
 *
 *   checking -> signed-out -> signing-in -> signed-in
 *                     ^-----------------------|
 *   signing-in -> error (page stays usable, retry allowed)
 *
 * Nothing here polls, retries in the background, or knows about the assistant
 * (MCP) authorization flow.
 */
export type AuthStatus = "checking" | "signed-out" | "signing-in" | "signed-in" | "error";

type PasswordResult = { error: string | null };
type SignUpResult = { error: string | null; needsConfirmation: boolean };
type OAuthResult = { error: string | null; redirected: boolean };

type AuthValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  error: string | null;
  signInWithPassword: (email: string, password: string) => Promise<PasswordResult>;
  signUpWithPassword: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<SignUpResult>;
  signInWithGoogle: (destination?: string) => Promise<OAuthResult>;
  signOut: () => Promise<void>;
};

/** Bounded-activity counters, used to prove the flow settles while idle. */
export const authDiagnostics = {
  providerMounts: 0,
  sessionReads: 0,
  listenerRegistrations: 0,
  authEvents: 0,
  oauthStarts: 0,
};

const AuthContext = createContext<AuthValue | null>(null);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  // Guards a single in-flight provider hand-off per click.
  const oauthPending = useRef(false);

  useEffect(() => {
    let active = true;
    authDiagnostics.providerMounts += 1;

    // 1. One subscription for the whole application.
    authDiagnostics.listenerRegistrations += 1;
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      authDiagnostics.authEvents += 1;
      setSession(next);
      setStatus(next ? "signed-in" : "signed-out");
      setError(null);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });

    // 2. One restore of the stored session at startup.
    authDiagnostics.sessionReads += 1;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setStatus(data.session ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setStatus("signed-out");
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  const value = useMemo<AuthValue>(() => {
    return {
      status,
      session,
      user: session?.user ?? null,
      error,
      async signInWithPassword(email, password) {
        setStatus("signing-in");
        setError(null);
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setStatus("signed-out");
          setError(signInError.message);
          return { error: signInError.message };
        }
        // The subscription moves the machine to signed-in.
        return { error: null };
      },
      async signUpWithPassword(email, password, displayName) {
        setStatus("signing-in");
        setError(null);
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (signUpError) {
          setStatus("signed-out");
          setError(signUpError.message);
          return { error: signUpError.message, needsConfirmation: false };
        }
        if (!data.session) {
          setStatus("signed-out");
          return { error: null, needsConfirmation: true };
        }
        return { error: null, needsConfirmation: false };
      },
      async signInWithGoogle(destination = DEFAULT_DESTINATION) {
        if (oauthPending.current) return { error: null, redirected: false };
        oauthPending.current = true;
        setStatus("signing-in");
        setError(null);
        // Where to continue is application state, never part of the provider
        // hand-off: the provider always returns to the site origin.
        rememberDestination(destination);
        authDiagnostics.oauthStarts += 1;
        try {
          const result = await lovable.auth.signInWithOAuth("google", {
            redirect_uri: window.location.origin,
          });
          if ("redirected" in result && result.redirected) {
            return { error: null, redirected: true };
          }
          if (result.error) {
            oauthPending.current = false;
            setStatus("error");
            setError(message(result.error));
            return { error: message(result.error), redirected: false };
          }
          oauthPending.current = false;
          return { error: null, redirected: false };
        } catch (e) {
          oauthPending.current = false;
          setStatus("error");
          setError(message(e));
          return { error: message(e), redirected: false };
        }
      },
      async signOut() {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        setSession(null);
        setStatus("signed-out");
      },
    };
  }, [status, session, error, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
