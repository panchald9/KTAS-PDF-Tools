import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  ClerkProvider as RealClerkProvider,
  useUser as useRealUser,
  useClerk as useRealClerk,
  UserButton as RealUserButton,
  SignIn as RealSignIn,
  SignUp as RealSignUp,
} from "@clerk/react";
import { useLocation } from "wouter";

const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";
export const hasValidClerkKey =
  Boolean(rawKey) &&
  (rawKey.startsWith("pk_test_") || rawKey.startsWith("pk_live_")) &&
  !rawKey.includes("local-key") &&
  !rawKey.includes("placeholder");

interface LocalUser {
  id: string;
  fullName: string;
  primaryEmailAddress: { emailAddress: string };
  emailAddresses: Array<{ emailAddress: string }>;
}

interface LocalAuthContextType {
  isSignedIn: boolean;
  user: LocalUser | null;
  signIn: (email?: string) => void;
  signOut: () => void;
}

const LocalAuthContext = createContext<LocalAuthContextType>({
  isSignedIn: true,
  user: {
    id: "local-owner",
    fullName: "Website Owner",
    primaryEmailAddress: { emailAddress: "owner@local" },
    emailAddresses: [{ emailAddress: "owner@local" }],
  },
  signIn: () => {},
  signOut: () => {},
});

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => {
    const saved = localStorage.getItem("ktas_local_auth");
    return saved !== null ? saved === "true" : true; // Default to signed-in locally
  });

  const user: LocalUser | null = isSignedIn
    ? {
        id: "local-owner",
        fullName: "Website Owner",
        primaryEmailAddress: { emailAddress: "owner@local" },
        emailAddresses: [{ emailAddress: "owner@local" }],
      }
    : null;

  const signIn = () => {
    setIsSignedIn(true);
    localStorage.setItem("ktas_local_auth", "true");
  };

  const signOut = () => {
    setIsSignedIn(false);
    localStorage.setItem("ktas_local_auth", "false");
  };

  return (
    <LocalAuthContext.Provider value={{ isSignedIn, user, signIn, signOut }}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useUser() {
  if (hasValidClerkKey) {
    return useRealUser();
  }
  const { isSignedIn, user } = useContext(LocalAuthContext);
  return {
    isLoaded: true,
    isSignedIn,
    user,
  };
}

export function useClerk() {
  if (hasValidClerkKey) {
    return useRealClerk();
  }
  const { signOut } = useContext(LocalAuthContext);
  return {
    addListener: () => () => {},
    signOut,
  };
}

export function UserButton() {
  if (hasValidClerkKey) {
    return <RealUserButton />;
  }
  const { user, signOut } = useContext(LocalAuthContext);
  const [, setLocation] = useLocation();

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm shadow-sm">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-medium text-foreground">Owner</span>
      </div>
      <button
        type="button"
        onClick={() => {
          signOut();
          setLocation("/");
        }}
        className="rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}

export function SignIn({ forceRedirectUrl = "/admin" }: { forceRedirectUrl?: string; [key: string]: any }) {
  if (hasValidClerkKey) {
    return <RealSignIn forceRedirectUrl={forceRedirectUrl} />;
  }
  const { signIn } = useContext(LocalAuthContext);
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("owner@local");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signIn(email);
    setLocation(forceRedirectUrl);
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-card-border bg-card p-8 shadow-xl">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign In as Owner</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Local Node.js standalone mode is active. Click below to access the Owner Console.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Owner Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary w-full justify-center py-2.5 font-medium"
        >
          Sign in to Owner Panel
        </button>
      </form>
    </div>
  );
}

export function SignUp(props: any) {
  if (hasValidClerkKey) {
    return <RealSignUp {...props} />;
  }
  return <SignIn forceRedirectUrl={props.forceRedirectUrl} />;
}

export function AppAuthProvider({ children, ...clerkProps }: { children: ReactNode; [key: string]: any }) {
  if (hasValidClerkKey) {
    return <RealClerkProvider {...(clerkProps as any)}>{children}</RealClerkProvider>;
  }
  return <LocalAuthProvider>{children}</LocalAuthProvider>;
}
