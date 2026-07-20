import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock } from "lucide-react";

type OAuthClient = { name?: string; client_name?: string; client_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  scopes?: string[];
};

type OAuthAPI = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthAPI {
  return (supabase.auth as unknown as { oauth: OAuthAPI }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      return data;
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Authorization error</CardTitle>
          <CardDescription>Could not load this authorization request.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </CardContent>
      </Card>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as AuthorizationDetails | null;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "an app";
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/) : []);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6 text-xl font-semibold">
          <Clock className="h-6 w-6 text-primary" /> TimeClock
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Connect {clientName} to TimeClock</CardTitle>
            <CardDescription>
              {clientName} will be able to call this app's enabled tools while you are signed in.
              This does not bypass this app's permissions or backend policies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {scopes.length > 0 && (
              <div className="text-sm">
                <div className="font-medium mb-1">Requested access</div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {scopes.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
                Cancel connection
              </Button>
              <Button disabled={busy} onClick={() => decide(true)}>
                Approve
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
