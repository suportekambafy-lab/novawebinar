import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, MessageCircle, Plus, Trash2 } from "lucide-react";
import { TeamBoard } from "@/components/support/team-board";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { summarizeAgents } from "@/components/team/model";
import { TeamPeople } from "@/components/team/team-people";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { whatsappLink } from "@/lib/contacts";
import { slugify, useWorkspace } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";
import {
  useCases,
  useDepartments,
  useRoutingRules,
  useSkills,
  useStaff,
  useSupportInvalidate,
  useSupportRealtime,
  useSupportSetup,
  type StaffMember,
} from "@/lib/support/hooks";
import {
  canManageTeam,
  INTENTS,
  isOpenStatus,
  PRIORITIES,
  type DepartmentRow,
  type RuleRow,
  type SkillRow,
} from "@/lib/support/model";
import { agentToday } from "@/lib/support/inbox";
import { deleteSkill, inviteStaff, removeStaffAccess } from "@/lib/support/support.functions";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Equipas | Novawebinar" },
      { name: "description", content: "Quem atende: o agente, as pessoas e as equipas que recebem cada tema." },
    ],
  }),
  component: TeamPage,
});

const NONE = "none";

/** O agente da conta e de cada webinar, resumido para o cartão de «Quem atende». */
function useAgentSummary(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "agents", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*, webinars(public_title, internal_name)")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return summarizeAgents(
        (data ?? []).map((row) => ({
          ...row,
          webinar_name: row.webinars ? row.webinars.public_title || row.webinars.internal_name : null,
        })),
      );
    },
  });
}

/** O mesmo número do Atendimento (a mesma chave de cache): conversas, não respostas. */
function useAgentToday(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "events", "ai-today", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      // ponytail: até 1000 eventos por dia (limite do PostgREST); com mais, uma função na base que conte.
      const { data, error } = await supabase
        .from("activity_events")
        .select("name, conversation_id, occurred_at")
        .eq("organization_id", organizationId!)
        .in("name", ["ai_resolution", "ai_escalation"])
        .gte("occurred_at", start.toISOString())
        .limit(1000);
      if (error) throw error;
      return agentToday(data ?? []);
    },
  });
}

function TeamPage() {
  const { data: workspace } = useWorkspace();
  const organizationId = workspace?.organizationId;
  const manager = canManageTeam(workspace?.role);
  const { data: setup } = useSupportSetup(organizationId);
  useSupportRealtime(organizationId);
  // Só depois de os valores iniciais existirem.
  const scope = setup ? organizationId : undefined;
  const { data: staff = [], isLoading } = useStaff(scope);
  const { data: departments = [] } = useDepartments(scope);
  const { data: skills = [] } = useSkills(scope);
  const { data: rules = [] } = useRoutingRules(scope);
  const { data: cases = [] } = useCases(manager ? scope : undefined);

  return (
    <AppShell
      title="Equipas"
      description="Quem atende: o agente responde primeiro e passa a cada equipa o que precisa de uma pessoa."
      action={false}
    >
      {!manager && workspace && (
        <p className="mb-4 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Só o proprietário e os administradores podem alterar a equipa.
        </p>
      )}
      {isLoading || !organizationId ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs defaultValue="people">
          <TabsList className="mb-5 flex h-auto w-full justify-start overflow-x-auto sm:w-auto max-sm:[&>button]:h-10">
            <TabsTrigger value="people">Quem atende</TabsTrigger>
            <TabsTrigger value="teams">Equipas<span className="max-sm:hidden"> · {departments.length}</span></TabsTrigger>
            <TabsTrigger value="skills">Competências<span className="max-sm:hidden"> · {skills.length}</span></TabsTrigger>
            <TabsTrigger value="rules">Regras</TabsTrigger>
          </TabsList>
          <TabsContent value="people">
            <StaffTab
              organizationId={organizationId}
              staff={staff}
              departments={departments}
              skills={skills}
              rules={rules}
              manager={manager}
              myUserId={workspace?.userId ?? ""}
            />
          </TabsContent>
          <TabsContent value="teams">
            <TeamsTab
              organizationId={organizationId}
              departments={departments}
              staff={staff}
              rules={rules}
              openByDepartment={countBy(
                cases.filter((c) => isOpenStatus(c.status)),
                (c) => c.department_id,
              )}
              manager={manager}
            />
          </TabsContent>
          <TabsContent value="skills">
            <SkillsTab organizationId={organizationId} skills={skills} staff={staff} manager={manager} />
          </TabsContent>
          <TabsContent value="rules">
            <RulesTab rules={rules} departments={departments} skills={skills} manager={manager} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function countBy<T>(rows: T[], key: (row: T) => string | null) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/* ---------- Quem atende: o agente e as pessoas por equipa ---------- */

type StaffForm = {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  job_title: string;
  department_id: string | null;
  skills: string[];
  capacity: number;
  is_supervisor: boolean;
  active: boolean;
};

const EMPTY_STAFF: StaffForm = {
  id: null,
  name: "",
  email: "",
  phone: "",
  job_title: "",
  department_id: null,
  skills: [],
  capacity: 5,
  is_supervisor: false,
  active: true,
};

function StaffTab({
  organizationId,
  staff,
  departments,
  skills,
  rules,
  manager,
  myUserId,
}: {
  organizationId: string;
  staff: StaffMember[];
  departments: DepartmentRow[];
  skills: SkillRow[];
  rules: RuleRow[];
  manager: boolean;
  myUserId: string;
}) {
  const invalidate = useSupportInvalidate();
  const invite = useServerFn(inviteStaff);
  const remove = useServerFn(removeStaffAccess);
  const { data: agent } = useAgentSummary(organizationId);
  const { data: today } = useAgentToday(organizationId);
  const [form, setForm] = useState<StaffForm | null>(null);
  const [link, setLink] = useState<{ person: StaffMember; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byId = (id: string) => staff.find((s) => s.id === id);

  const sendInvite = async (person: StaffMember) => {
    setBusy(person.id);
    try {
      const result = await invite({ data: { staffId: person.id } });
      invalidate("staff");
      if (result.link) setLink({ person, url: result.link });
      else
        toast.success(
          `${person.name} já tinha conta: passa a ver este espaço de trabalho quando entrar com a palavra-passe que já usa.`,
        );
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível criar o convite."));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (person: StaffMember) => {
    if (!window.confirm(`Tirar o acesso a ${person.name}? Os casos que tem ficam sem responsável.`)) return;
    setBusy(person.id);
    try {
      await remove({ data: { staffId: person.id } });
      invalidate("staff", "cases");
      toast.success(`${person.name} deixou de ter acesso.`);
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível tirar o acesso."));
    } finally {
      setBusy(null);
    }
  };

  const skillName = (slug: string) => skills.find((s) => s.slug === slug)?.name ?? slug;

  return (
    <>
      <TeamPeople
        agent={agent ?? null}
        today={today ?? null}
        teams={departments.map((d) => ({ id: d.id, name: d.name, isFallback: d.is_fallback }))}
        rules={rules.map((r) => ({
          intent: r.intent,
          teamId: r.department_id,
          slaMinutes: r.sla_minutes,
          alwaysHuman: r.always_human,
        }))}
        people={staff.map((s) => ({
          id: s.id,
          name: s.name,
          jobTitle: s.job_title,
          email: s.email,
          teamId: s.department_id,
          presence: s.presence,
          active: s.active,
          supervisor: s.is_supervisor,
          skills: s.skills.map(skillName),
          openCases: s.openCases,
          capacity: s.capacity,
          hasAccess: Boolean(s.user_id),
          isMe: Boolean(myUserId) && s.user_id === myUserId,
        }))}
        manager={manager}
        busyId={busy}
        onAdd={() => setForm(EMPTY_STAFF)}
        onInvite={(id) => {
          const person = byId(id);
          if (person) void sendInvite(person);
        }}
        onRevoke={(id) => {
          const person = byId(id);
          if (person) void revoke(person);
        }}
        onEdit={(id) => {
          const person = byId(id);
          if (!person) return;
          setForm({
            id: person.id,
            name: person.name,
            email: person.email,
            phone: person.phone ?? "",
            job_title: person.job_title,
            department_id: person.department_id,
            skills: person.skills,
            capacity: person.capacity,
            is_supervisor: person.is_supervisor,
            active: person.active,
          });
        }}
      />

      <StaffDialog
        form={form}
        organizationId={organizationId}
        departments={departments}
        skills={skills}
        onClose={() => setForm(null)}
      />
      <InviteDialog link={link} onClose={() => setLink(null)} />
    </>
  );
}

function StaffDialog({
  form,
  organizationId,
  departments,
  skills,
  onClose,
}: {
  form: StaffForm | null;
  organizationId: string;
  departments: DepartmentRow[];
  skills: SkillRow[];
  onClose: () => void;
}) {
  const invalidate = useSupportInvalidate();
  const [draft, setDraft] = useState<StaffForm>(EMPTY_STAFF);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (form) setDraft(form);
  }, [form]);
  const set = <K extends keyof StaffForm>(key: K, value: StaffForm[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const row = {
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      phone: draft.phone.trim() || null,
      job_title: draft.job_title.trim(),
      department_id: draft.department_id,
      skills: draft.skills,
      capacity: Math.min(50, Math.max(1, Math.round(draft.capacity) || 1)),
      is_supervisor: draft.is_supervisor,
      active: draft.active,
    };
    const { error } = draft.id
      ? await supabase
          .from("support_staff")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", draft.id)
      : await supabase.from("support_staff").insert({ ...row, organization_id: organizationId });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Já existe uma pessoa com este email."
          : friendlyError(error, "Não foi possível guardar."),
      );
      return;
    }
    invalidate("staff");
    toast.success(draft.id ? "Pessoa actualizada." : "Pessoa registada. Falta convidá-la a entrar.");
    onClose();
  };

  return (
    <Dialog open={form !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Editar pessoa" : "Nova pessoa"}</DialogTitle>
          <DialogDescription>
            A equipa e as competências decidem que conversas chegam a esta pessoa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" id="staff-name">
              <Input id="staff-name" value={draft.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} />
            </Field>
            <Field label="Função" id="staff-title">
              <Input
                id="staff-title"
                value={draft.job_title}
                onChange={(e) => set("job_title", e.target.value)}
                maxLength={80}
                placeholder="Ex.: Comercial"
              />
            </Field>
            <Field label="Email" id="staff-email">
              <Input
                id="staff-email"
                type="email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
                required
                maxLength={255}
              />
            </Field>
            <Field label="Telefone" id="staff-phone">
              <Input
                id="staff-phone"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                maxLength={30}
                placeholder="+244 923 000 000"
              />
            </Field>
            <Field label="Equipa" id="staff-department">
              <Select
                value={draft.department_id ?? NONE}
                onValueChange={(value) => set("department_id", value === NONE ? null : value)}
              >
                <SelectTrigger id="staff-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem equipa</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Casos ao mesmo tempo" id="staff-capacity">
              <Input
                id="staff-capacity"
                type="number"
                min={1}
                max={50}
                value={draft.capacity}
                onChange={(e) => set("capacity", Number(e.target.value))}
              />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Competências</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {skills.map((skill) => (
                <label key={skill.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.skills.includes(skill.slug)}
                    onCheckedChange={(checked) =>
                      set(
                        "skills",
                        checked === true
                          ? [...draft.skills, skill.slug]
                          : draft.skills.filter((s) => s !== skill.slug),
                      )
                    }
                  />
                  {skill.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Supervisor
                <span className="block text-xs text-muted-foreground">
                  Recebe os casos escalados e os que passam do prazo.
                </span>
              </span>
              <Switch checked={draft.is_supervisor} onCheckedChange={(value) => set("is_supervisor", value)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Activo
                <span className="block text-xs text-muted-foreground">Inactivo não recebe casos.</span>
              </span>
              <Switch checked={draft.active} onCheckedChange={(value) => set("active", value)} />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function InviteDialog({
  link,
  onClose,
}: {
  link: { person: StaffMember; url: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [link]);
  if (!link) return <Dialog open={false} />;
  const message = `Olá ${link.person.name.split(" ")[0]}, este é o seu acesso ao atendimento. Abra o link e defina a sua palavra-passe: ${link.url}`;
  const wa = whatsappLink(link.person.phone, message);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convite para {link.person.name}</DialogTitle>
          <DialogDescription>
            Envie este link só a esta pessoa. Quem o abrir entra com a conta dela e define a palavra-passe. O
            link só é mostrado agora.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Link de convite" />
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(link.url);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <DialogFooter>
          {wa && (
            <Button asChild variant="outline">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Enviar no WhatsApp
              </a>
            </Button>
          )}
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Equipas ---------- */

/** As equipas em cartões (`TeamBoard`); aqui só as gravações. */
function TeamsTab({
  organizationId,
  departments,
  staff,
  rules,
  openByDepartment,
  manager,
}: {
  organizationId: string;
  departments: DepartmentRow[];
  staff: StaffMember[];
  rules: RuleRow[];
  openByDepartment: Map<string, number>;
  manager: boolean;
}) {
  const invalidate = useSupportInvalidate();
  const done = (error: { message: string } | null, ...keys: string[]) => {
    if (error) toast.error(friendlyError(error, "Não foi possível guardar."));
    invalidate(...keys);
  };

  const create = async (name: string) => {
    const { error } = await supabase.from("support_departments").insert({
      organization_id: organizationId,
      name,
      slug: slugify(name) || `equipa-${departments.length + 1}`,
      position: departments.length + 1,
    });
    if (error) {
      toast.error(
        error.code === "23505" ? "Já existe uma equipa com este nome." : friendlyError(error),
      );
      return false;
    }
    invalidate("departments");
    return true;
  };

  const remove = async (id: string, name: string) => {
    const people = staff.filter((s) => s.department_id === id).length;
    const open = openByDepartment.get(id) ?? 0;
    const warning =
      people || open
        ? `${name} tem ${people} pessoa(s) e ${open} caso(s) aberto(s), que ficam sem equipa. Apagar?`
        : `Apagar ${name}?`;
    if (!window.confirm(warning)) return;
    const { error } = await supabase.from("support_departments").delete().eq("id", id);
    done(error, "departments", "staff", "rules", "cases");
  };

  const makeFallback = async (id: string) => {
    // Primeiro entra a nova, depois sai a actual: se o segundo passo falhar fica uma a mais por instantes,
    // nunca nenhuma (as conversas sem equipa ficavam sem destino).
    const current = departments.find((d) => d.is_fallback && d.id !== id);
    const { error } = await supabase
      .from("support_departments")
      .update({ is_fallback: true })
      .eq("id", id);
    if (error || !current) return done(error, "departments");
    const { error: clearError } = await supabase
      .from("support_departments")
      .update({ is_fallback: false })
      .eq("id", current.id);
    done(clearError, "departments");
  };

  return (
    <TeamBoard
      teams={departments.map((d) => ({ id: d.id, name: d.name, isFallback: d.is_fallback }))}
      people={staff.map((s) => ({
        id: s.id,
        name: s.name,
        teamId: s.department_id,
        presence: s.presence,
        active: s.active,
        supervisor: s.is_supervisor,
      }))}
      rules={rules.map((r) => ({
        id: r.id,
        intent: r.intent,
        teamId: r.department_id,
        slaMinutes: r.sla_minutes,
      }))}
      manager={manager}
      onCreate={create}
      onRename={async (team, name) => {
        const { error } = await supabase
          .from("support_departments")
          .update({ name })
          .eq("id", team.id);
        done(error, "departments");
      }}
      onDelete={(team) => void remove(team.id, team.name)}
      onMakeFallback={(team) => void makeFallback(team.id)}
      onMove={async (personId, teamId) => {
        const { error } = await supabase
          .from("support_staff")
          .update({ department_id: teamId, updated_at: new Date().toISOString() })
          .eq("id", personId);
        done(error, "staff");
      }}
      onRoute={async (ruleId, teamId) => {
        const { error } = await supabase
          .from("support_routing_rules")
          .update({ department_id: teamId, updated_at: new Date().toISOString() })
          .eq("id", ruleId);
        done(error, "rules");
      }}
    />
  );
}

/* ---------- Competências ---------- */

function SkillsTab({
  organizationId,
  skills,
  staff,
  manager,
}: {
  organizationId: string;
  skills: SkillRow[];
  staff: StaffMember[];
  manager: boolean;
}) {
  const invalidate = useSupportInvalidate();
  const drop = useServerFn(deleteSkill);
  const [name, setName] = useState("");

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    const { error } = await supabase
      .from("support_skills")
      .insert({ organization_id: organizationId, name: clean, slug: slugify(clean) });
    if (error) {
      toast.error(error.code === "23505" ? "Essa competência já existe." : friendlyError(error));
      return;
    }
    setName("");
    invalidate("skills");
  };

  const remove = async (skill: SkillRow) => {
    const people = staff.filter((s) => s.skills.includes(skill.slug)).length;
    if (
      !window.confirm(
        people
          ? `${people} pessoa(s) têm “${skill.name}”. Apagar tira-a a todos e às regras que a pedem. Apagar?`
          : `Apagar “${skill.name}”?`,
      )
    )
      return;
    try {
      await drop({ data: { skillId: skill.id } });
      invalidate("skills", "staff", "rules");
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível apagar."));
    }
  };

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        O que cada pessoa sabe tratar. Um caso pode pedir uma ou mais competências; quem as tem todas recebe
        primeiro.
      </p>
      <ul className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <li key={skill.id}>
            <Badge variant="outline" className="gap-2 py-1.5 pl-3 pr-1.5 text-sm font-normal">
              {skill.name}
              <span className="text-xs text-muted-foreground">
                {staff.filter((s) => s.skills.includes(skill.slug)).length}
              </span>
              {manager && (
                <button
                  type="button"
                  onClick={() => void remove(skill)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={`Apagar ${skill.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </Badge>
          </li>
        ))}
      </ul>
      {manager && (
        <form onSubmit={add} className="flex max-w-md gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nova competência"
            maxLength={40}
            aria-label="Nome da nova competência"
          />
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            <Plus /> Adicionar
          </Button>
        </form>
      )}
    </div>
  );
}

/* ---------- Regras ---------- */

function RulesTab({
  rules,
  departments,
  skills,
  manager,
}: {
  rules: RuleRow[];
  departments: DepartmentRow[];
  skills: SkillRow[];
  manager: boolean;
}) {
  const invalidate = useSupportInvalidate();
  const update = async (rule: RuleRow, changes: Partial<RuleRow>) => {
    const { error } = await supabase
      .from("support_routing_rules")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", rule.id);
    if (error) toast.error(friendlyError(error, "Não foi possível guardar a regra."));
    invalidate("rules");
  };

  const ordered = INTENTS.map((intent) => ({ intent, rule: rules.find((r) => r.intent === intent.id) })).filter(
    (row): row is { intent: (typeof INTENTS)[number]; rule: RuleRow } => Boolean(row.rule),
  );

  return (
    <div className="space-y-4">
      <div className="max-w-3xl space-y-1 text-sm text-muted-foreground">
        <p>
          Para cada tipo de pedido: a equipa, as competências que pede, a urgência e o prazo para a
          primeira resposta de uma pessoa.
        </p>
        <p>
          A pessoa é escolhida por esta ordem: equipa e competências, quem está disponível, quem tem
          capacidade, quem já atendeu o contacto, quem tem menos casos.
        </p>
      </div>
      <div className="overflow-x-auto rounded-card bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Equipa</TableHead>
              <TableHead>Competências</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Prazo (min)</TableHead>
              <TableHead>Sempre uma pessoa</TableHead>
              <TableHead>Pedir ligação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map(({ intent, rule }) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{intent.label}</TableCell>
                <TableCell>
                  <Select
                    value={rule.department_id ?? NONE}
                    disabled={!manager}
                    onValueChange={(value) =>
                      void update(rule, { department_id: value === NONE ? null : value })
                    }
                  >
                    <SelectTrigger className="h-9 w-44" aria-label={`Equipa de ${intent.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Equipa que recebe o resto</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <SkillPicker
                    value={rule.required_skills}
                    skills={skills}
                    disabled={!manager}
                    onChange={(required_skills) => void update(rule, { required_skills })}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={rule.priority}
                    disabled={!manager}
                    onValueChange={(priority) => void update(rule, { priority })}
                  >
                    <SelectTrigger className="h-9 w-32" aria-label={`Prioridade de ${intent.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    max={10080}
                    defaultValue={rule.sla_minutes}
                    disabled={!manager}
                    aria-label={`Prazo de ${intent.label}, em minutos`}
                    className="h-9 w-24"
                    onBlur={(e) => {
                      const minutes = Math.min(10080, Math.max(1, Math.round(Number(e.target.value)) || 1));
                      if (minutes !== rule.sla_minutes) void update(rule, { sla_minutes: minutes });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={rule.always_human}
                    disabled={!manager}
                    aria-label={`${intent.label}: sempre uma pessoa`}
                    onCheckedChange={(always_human) => void update(rule, { always_human })}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={rule.call_required}
                    disabled={!manager}
                    aria-label={`${intent.label}: pedir ligação`}
                    onCheckedChange={(call_required) => void update(rule, { call_required })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        “Sempre uma pessoa”: a IA nunca responde sozinha a este tipo de pedido, mesmo que saiba a resposta.
      </p>
    </div>
  );
}

function SkillPicker({
  value,
  skills,
  disabled,
  onChange,
}: {
  value: string[];
  skills: SkillRow[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const names = value.map((slug) => skills.find((s) => s.slug === slug)?.name ?? slug);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-9 max-w-[14rem] justify-start font-normal"
      >
        <span className="truncate">{names.length ? names.join(", ") : "Nenhuma"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Competências pedidas</DialogTitle>
            <DialogDescription>Quem tiver todas recebe primeiro.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {skills.map((skill) => (
              <label key={skill.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.includes(skill.slug)}
                  onCheckedChange={(checked) =>
                    setDraft(
                      checked === true ? [...draft, skill.slug] : draft.filter((s) => s !== skill.slug),
                    )
                  }
                />
                {skill.name}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
