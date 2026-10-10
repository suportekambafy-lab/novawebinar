import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { resetInitialPageLoader } from "@/components/page-loader";
import { AuthError, AuthHeading, AuthUI, PasswordField } from "@/components/ui/auth-ui";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

/** Chegada de um convite de equipa ou de uma recuperação: a pessoa define a palavra-passe. */
export const Route = createFileRoute("/auth/welcome")({
  head: () => ({
    meta: [
      { title: "Definir palavra-passe | Novawebinar" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();
  /** null enquanto o cliente lê a sessão que vem no endereço. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setSignedIn(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(friendlyError(error, "Não foi possível guardar a palavra-passe."));
      return;
    }
    resetInitialPageLoader();
    // O painel leva cada função à sua página de entrada.
    await navigate({ to: "/dashboard" });
  };

  return (
    <AuthUI>
      {signedIn === false ? (
        <div>
          <AuthHeading title="Este link já não é válido">
            O convite ou o pedido de recuperação expirou ou já foi usado. Peça um novo para definir
            a palavra-passe.
          </AuthHeading>
          <Link to="/auth/reset" className="site-btn site-btn-primary w-full">
            Pedir novo link
          </Link>
        </div>
      ) : (
        <>
          <AuthHeading title="Defina a sua palavra-passe">
            É com ela e com o seu email que passa a entrar no painel.
          </AuthHeading>
          <form onSubmit={submit} className="grid gap-5">
            <PasswordField
              id="new-password"
              label="Palavra-passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="new-password"
              aria-describedby="new-password-rule"
              after={
                <p id="new-password-rule" className="mt-2 text-site-meta text-s-text-2">
                  Pelo menos 8 caracteres.
                </p>
              }
            />
            {message && <AuthError>{message}</AuthError>}
            <button
              type="submit"
              className="site-btn site-btn-primary w-full"
              disabled={saving || signedIn === null}
            >
              {saving ? "A guardar…" : "Guardar e entrar"}
            </button>
          </form>
        </>
      )}
    </AuthUI>
  );
}
