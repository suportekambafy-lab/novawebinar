import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Check, ExternalLink, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { NavTabs } from "@/components/ds/navigation";
import { useWebhookDestination } from "@/components/automation-flow";
import { RunSheet, RunsTable } from "@/components/automation-runs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasNodeSettings } from "@/components/workflow/canvas-node-settings";
import { CapturePanel } from "@/components/workflow/capture-panel";
import { FlowMap, type FlowComponent, type XY } from "@/components/workflow/flow-map";
import { ModelDialog, ReadyStatus, SettingsPanel, type ReadyCheck } from "@/components/workflow/flow-tools";
import { PALETTE } from "@/components/workflow/step-panel";
import { AutomationSettings, StepSettings } from "@/components/workflow/step-settings";
import type { Json } from "@/integrations/supabase/types";
import {
  addModelAutomations,
  addWorkflowAutomation,
  saveWorkflow,
  deactivateWorkflowAutomations,
  setAutomationArchived,
  setWorkflowWebinar,
  updateAutomation,
  useAutomationRuns,
  useAutomationStats,
  useInvalidate,
  useWebinarJourneyCounts,
  useWebinars,
  useWorkflow,
  useWorkflows,
  useWorkspace,
  type AutomationRun,
  type RegistrationForm,
  type Workflow,
} from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";
import { cn } from "@/lib/utils";
import {
  activationBlockers,
  CHANNELS,
  channelStatus,
  endOfMain,
  executedNodes,
  insertAfter,
  isModelAsIs,
  MODEL_GROUP,
  modelAutomations,
  newId,
  nodeMap,
  nodeTitle,
  PAGE_TYPE_LABEL,
  readCanvas,
  readSteps,
  renameGroupIn,
  triggerTitle,
  usesGroup,
  validateSteps,
  type BaseAutomation,
  type Canvas,
  type CanvasNode,
  type ChannelStatus,
} from "@/lib/workflow";

type Tab = "fluxo" | "execucoes" | "configuracao";
type Search = { a?: string | undefined; tab?: Tab | undefined; run?: string | undefined };
/** O elemento com as definições abertas: um nó do canvas (página, grupo, origem) ou um passo de uma automação. */
type Selected = { kind: "canvas"; node: CanvasNode } | { kind: "step"; automationId: string; nodeId: string };
type GroupNode = Extract<CanvasNode, { kind: "group" }>;
const TABS: { key: Tab; label: string }[] = [
  { key: "fluxo", label: "Fluxo" },
  { key: "execucoes", label: "Execuções" },
  { key: "configuracao", label: "Configuração" },
];
const NO_WEBINAR = "Escolha o webinar do fluxo, em Configuração";
const NONE = "none";

export const Route = createFileRoute("/automations/workflows/$workflowId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["a"] === "string" ? { a: s["a"] } : {}),
    ...(typeof s["tab"] === "string" && TABS.some((t) => t.key === s["tab"]) ? { tab: s["tab"] as Tab } : {}),
    ...(typeof s["run"] === "string" ? { run: s["run"] } : {}),
  }),
  head: () => ({ meta: [{ title: "Fluxo | Novawebinar" }] }),
  component: WorkflowPage,
});

function WorkflowPage() {
  const { workflowId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data, isLoading } = useWorkflow(workflowId);
  const stats = useAutomationStats(orgId);
  const counts = useWebinarJourneyCounts(data?.workflow.webinar_id);
  const destination = useWebhookDestination(orgId, data?.workflow.webinar_id ?? null);
  const invalidate = useInvalidate();
  const automations = (data?.automations ?? []).filter((a) => !a.archived_at);
  const ids = automations.map((a) => a.id);
  const { data: runs = [] } = useAutomationRuns({ automationIds: ids }, 500);
  const [open, setOpen] = useState<Selected | null>(null);
  const [full, setFull] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Esc sai do ecrã inteiro.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);
  const queryClient = useQueryClient();
  const tab = search.tab ?? "fluxo";
  const status = channelStatus(Boolean(workspace?.isTest), destination.ready, destination.whatsappReady);

  const go = (patch: Partial<Search>) =>
    void navigate({ search: (prev: Search) => ({ ...prev, ...patch }), replace: true });

  if (isLoading || !data) {
    return (
      <AppShell title="Fluxo" action={false}>
        {isLoading ? <Skeleton className="h-[60vh] w-full" /> : <p className="text-muted-foreground">Este fluxo não existe ou não pertence a este espaço de trabalho.</p>}
      </AppShell>
    );
  }
  const { workflow, forms } = data;
  const canvas = readCanvas(workflow.canvas);
  const webinarTitle = workflow.webinars ? workflow.webinars.public_title || workflow.webinars.internal_name : "Sem webinar";
  const selected = search.a ? automations.find((a) => a.id === search.a) : undefined;
  const active = automations.filter((a) => a.active).length;
  const pending = runs.filter((r) => ["waiting", "ready", "running"].includes(r.status)).length;
  const openRun = search.run ? (runs.find((r) => r.id === search.run) ?? null) : null;
  const statsOf = (id: string) =>
    stats.data?.get(id) ?? { contacts: 0, runs: 0, done: 0, pending: 0, failed: 0, cancelled: 0, lastRunAt: null, nextRunAt: null };
  const groups = canvas.nodes.filter((n): n is GroupNode => n.kind === "group");
  const groupNames = groups.map((g) => g.name.trim()).filter(Boolean);
  const blocked = workflow.webinar_id ? [] : [NO_WEBINAR];

  const saveCanvas = async (next: Canvas) => {
    // Optimista: o mapa mexe logo, e a gravação seguinte já parte deste estado.
    queryClient.setQueryData(["workflows", "one", workflowId], (old: typeof data) =>
      old ? { ...old, workflow: { ...old.workflow, canvas: next as unknown as Json } } : old,
    );
    try {
      await saveWorkflow(workflow.id, { canvas: next as unknown as Json });
      invalidate(["workflows"]);
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível guardar o fluxo."));
    }
  };
  /** Grava onde a automação foi largada. `base`: o canvas acabado de gravar (ex.: com o grupo novo), para não o perder. */
  const placed = (id: string, at?: XY, base = canvas) =>
    at ? saveCanvas({ ...base, positions: { ...base.positions, [`auto:${id}`]: at } }) : undefined;
  /** O modelo escreve para os grupos do fluxo; sem nenhum, põe o «Grupo do lançamento» no fluxo, para se ver e configurar. Devolve o canvas com que ficou. */
  const withGroup = async (list: BaseAutomation[]): Promise<Canvas> => {
    if (groups.length || !list.some((a) => usesGroup(a.steps))) return canvas;
    const next: Canvas = { ...canvas, nodes: [...canvas.nodes, { id: `grupo-${Date.now().toString(36)}`, kind: "group", name: MODEL_GROUP, url: "" }] };
    await saveCanvas(next);
    return next;
  };
  // Fluxos de antes do fluxo vazio nasceram com o modelo: as automações do modelo desligadas, sem execuções e por mexer
  // saem de uma vez com «Começar vazio» (arquivadas; «Desfazer» repõe-nas). Só depois de saber as execuções.
  const leftovers = stats.data
    ? automations.filter((a) => !a.active && !statsOf(a.id).runs && !runs.some((r) => r.automation_id === a.id) && isModelAsIs(a))
    : [];
  const startEmpty = async () => {
    const gone = leftovers.map((a) => a.id);
    const restore = () =>
      Promise.all(gone.map((id) => setAutomationArchived(id, false)))
        .catch((error) => toast.error(friendlyError(error, "Não foi possível repor o modelo.")))
        .finally(() => invalidate(["workflows", "automations"]));
    try {
      await Promise.all(gone.map((id) => setAutomationArchived(id, true)));
      setOpen(null);
      go({ a: undefined });
      toast.success(`${gone.length} ${gone.length === 1 ? "automação do modelo saiu" : "automações do modelo saíram"} do fluxo`, {
        description: "Ficam arquivadas.",
        duration: 10_000,
        action: { label: "Desfazer", onClick: () => void restore() },
      });
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível tirar o modelo."));
    } finally {
      invalidate(["workflows", "automations"]);
    }
  };
  /** «Usar modelo»: as automações escolhidas entram juntas, desligadas. */
  const applyModel = async (keys: string[]) => {
    const list = modelAutomations(keys, groupNames);
    setBusy(true);
    try {
      await withGroup(list);
      await addModelAutomations(workflow, list);
      invalidate(["workflows", "automations"]);
      setModelOpen(false);
      toast.success(`${list.length} ${list.length === 1 ? "automação entrou" : "automações entraram"} no fluxo, desligadas`, {
        description: "Clique nas mensagens para as rever e depois ligue cada automação.",
      });
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível usar o modelo."));
    } finally {
      setBusy(false);
    }
  };
  /** Uma automação nova, vazia, a começar num gatilho: abre logo as definições dela. */
  const addAutomation = async (trigger: string, at?: XY) => {
    try {
      const id = await addWorkflowAutomation(workflow, trigger, triggerTitle(trigger));
      await placed(id, at);
      invalidate(["workflows", "automations"]);
      setOpen(null);
      go({ a: id, tab: "fluxo" });
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível criar a automação."));
    }
  };
  // O que vem do menu das peças: gatilho, automação do modelo, página, grupo, origem, ou um passo (mensagem, espera, condição).
  const addComponent = async (component: FlowComponent, at?: XY, automationId?: string) => {
    if (component.kind === "trigger") return addAutomation(component.trigger, at);
    if (component.kind === "step") {
      const item = PALETTE.find((p) => p.key === component.key);
      const target = automations.find((a) => a.id === automationId);
      if (!item) return;
      // Uma mensagem nos grupos com um só grupo no fluxo já vai para ele; com vários, escolhe-se ao abri-la.
      const make = (id: string) => {
        const node = item.make(id);
        if (node.kind === "action" && groupNames.length === 1) node.sends = node.sends.map((s) => (s.target === "group" && !s.group ? { ...s, group: groupNames[0]! } : s));
        return node;
      };
      try {
        if (target) {
          // Entra no fim do caminho principal da automação onde foi largado.
          const steps = readSteps(target.steps) ?? { start: null, nodes: [] };
          const node = make(newId(steps));
          const point = endOfMain(steps);
          const next = insertAfter(steps, point.after, node, point.branch ?? "yes");
          const problems = validateSteps(next);
          if (problems.length) {
            toast.error(problems[0]);
            return;
          }
          await updateAutomation(target.id, { steps: next as unknown as Json });
          invalidate(["workflows", "automations"]);
          setOpen({ kind: "step", automationId: target.id, nodeId: node.id });
        } else {
          // Largado fora de uma automação: nasce uma nova só com este passo.
          const node = make("p1");
          const id = await addWorkflowAutomation(workflow, "webinar_registered", "Nova automação", {
            conditions: [],
            steps: { start: node.id, nodes: [node] },
          });
          await placed(id, at);
          invalidate(["workflows", "automations"]);
          toast.success("Nova automação, em rascunho", { description: "Entra quando alguém se inscreve; mude o gatilho ao abri-la." });
          setOpen({ kind: "step", automationId: id, nodeId: node.id });
        }
      } catch (error) {
        toast.error(friendlyError(error, "Não foi possível acrescentar o passo."));
      }
      return;
    }
    if (component.kind === "automation") {
      const template = modelAutomations([component.key], groupNames)[0];
      if (!template) return addAutomation("webinar_registered", at);
      try {
        const base = await withGroup([template]);
        const id = await addWorkflowAutomation(workflow, template.trigger_event, template.name, template);
        await placed(id, at, base);
        invalidate(["workflows", "automations"]);
        toast.success(`«${template.name}» está no fluxo, em rascunho`, { description: "Clique nas mensagens para as rever." });
      } catch (error) {
        toast.error(friendlyError(error, "Não foi possível criar a automação."));
      }
      return;
    }
    if (component.kind === "group" && component.id) {
      const node = groups.find((g) => g.id === component.id);
      if (node) setOpen({ kind: "canvas", node });
      return;
    }
    const id = `${component.kind === "page" ? "pagina" : component.kind === "group" ? "grupo" : "origem"}-${Date.now().toString(36)}`;
    // O motor procura o grupo pelo nome: o nome novo nunca repete o de outro grupo.
    let n = groups.length + 1;
    while (groupNames.includes(`Grupo ${n}`)) n += 1;
    const node: CanvasNode =
      component.kind === "page"
        ? { id, kind: "page", name: component.pageType === "outro" ? "Página" : PAGE_TYPE_LABEL[component.pageType], url: "", pageType: component.pageType }
        : component.kind === "group"
          ? { id, kind: "group", name: groups.length ? `Grupo ${n}` : MODEL_GROUP, url: "" }
          : { id, kind: "origin", source: component.source, ...(component.placement ? { placement: component.placement } : {}) };
    await saveCanvas({
      ...canvas,
      nodes: [...canvas.nodes, node],
      positions: at ? { ...canvas.positions, [`${component.kind}:${id}`]: at } : canvas.positions,
    });
    // Página ou grupo novo: abre logo as definições (nome e endereço).
    if (node.kind !== "origin") {
      setOpen({ kind: "canvas", node });
    }
  };
  const saveNode = async (node: CanvasNode) => {
    const before = canvas.nodes.find((n) => n.id === node.id);
    void saveCanvas({ ...canvas, nodes: before ? canvas.nodes.map((n) => (n.id === node.id ? node : n)) : [...canvas.nodes, node] });
    setOpen(null);
    // Um grupo que muda de nome leva com ele as mensagens que eram para ele.
    if (before?.kind !== "group" || node.kind !== "group" || before.name === node.name) return;
    try {
      for (const a of automations) {
        const steps = renameGroupIn(readSteps(a.steps), before.name, node.name);
        if (steps) await updateAutomation(a.id, { steps: steps as unknown as Json });
      }
      invalidate(["workflows", "automations"]);
    } catch (error) {
      toast.error(friendlyError(error, "O grupo mudou de nome, mas algumas mensagens ainda usam o nome antigo."));
    }
  };
  const stepOpen = open?.kind === "step" ? automations.find((a) => a.id === open.automationId) : undefined;
  const stepNode = open?.kind === "step" && stepOpen ? nodeMap(readSteps(stepOpen.steps) ?? { start: null, nodes: [] }).get(open.nodeId) : undefined;
  const onMap = tab === "fluxo";
  const settings =
    open?.kind === "canvas" ? (
      <SettingsPanel
        docked={onMap}
        title={open.node.kind === "page" ? "Página" : open.node.kind === "group" ? "Grupo de WhatsApp" : "Origem do tráfego"}
        kicker={open.node.kind === "page" ? PAGE_TYPE_LABEL[open.node.pageType] : undefined}
        onClose={() => setOpen(null)}
      >
        <CanvasNodeSettings
          key={open.node.id}
          node={open.node}
          groups={groups}
          onSave={(node) => void saveNode(node)}
          onRemove={(id) => {
            void saveCanvas({ ...canvas, nodes: canvas.nodes.filter((n) => n.id !== id) });
            setOpen(null);
          }}
        />
      </SettingsPanel>
    ) : open?.kind === "step" && stepOpen ? (
      <SettingsPanel
        docked={onMap}
        title={stepNode ? nodeTitle(stepNode) : "Passo"}
        kicker={`${stepOpen.name} · Quando: ${triggerTitle(stepOpen.trigger_event)}`}
        onClose={() => setOpen(null)}
      >
        <StepSettings
          key={`${stepOpen.id}:${open.nodeId}:${stepOpen.updated_at}`}
          automation={stepOpen}
          nodeId={open.nodeId}
          status={status}
          groups={groupNames}
          executed={executedNodes(runs.filter((r) => r.automation_id === stepOpen.id)).has(open.nodeId)}
          onDone={() => setOpen(null)}
          onOpenStep={(nodeId) => setOpen({ kind: "step", automationId: stepOpen.id, nodeId })}
          onOpenAutomation={() => {
            setOpen(null);
            go({ a: stepOpen.id });
          }}
        />
      </SettingsPanel>
    ) : selected ? (
      <SettingsPanel
        docked={onMap}
        title={selected.name}
        kicker={`Automação · Quando: ${triggerTitle(selected.trigger_event)}`}
        onClose={() => go({ a: undefined })}
      >
        <AutomationSettings
          key={`${selected.id}:${selected.updated_at}`}
          automation={selected}
          status={status}
          blocked={blocked}
          runs={runs.filter((r) => r.automation_id === selected.id).length}
          onOpenRuns={() => go({ tab: "execucoes", a: undefined })}
          onDone={() => go({ a: undefined })}
        />
      </SettingsPanel>
    ) : null;

  // «Pronto para ligar?»: o que ainda falta, num só botão na barra de cima.
  const incomplete = automations.filter((a) => activationBlockers(readSteps(a.steps), status).length > 0).length;
  const readyChannels = status.filter((s) => s.ready).map((s) => CHANNELS[s.channel].label);
  const toConfig = () => go({ tab: "configuracao", a: undefined });
  const noLink = groups.filter((g) => !g.url.trim()).length;
  const checks: ReadyCheck[] = [
    { ok: Boolean(workflow.webinar_id), label: workflow.webinar_id ? `Webinar «${webinarTitle}»` : "Escolher o webinar", onClick: toConfig },
    {
      ok: groups.length > 0 && noLink === 0,
      label: !groups.length ? "Sem grupo de WhatsApp" : noLink ? `${noLink} ${noLink === 1 ? "grupo sem link" : "grupos sem link"} de convite` : `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"} de WhatsApp`,
      onClick: toConfig,
    },
    {
      ok: readyChannels.length === status.length,
      label: readyChannels.length === status.length ? "Canais prontos" : readyChannels.length ? `Canais: só ${readyChannels.join(", ")}` : "Canais: nenhum ligado",
      onClick: toConfig,
    },
    { ok: automations.length > 0 && incomplete === 0, label: !automations.length ? "Ainda sem automações" : incomplete ? `${incomplete} ${incomplete === 1 ? "automação" : "automações"} por completar` : "Mensagens completas" },
    // Sem automações, «Ainda sem automações» já o diz.
    ...(automations.length ? [{ ok: active > 0, label: `${active} de ${automations.length} ligadas${pending ? ` · ${pending} em curso` : ""}` }] : []),
  ];

  return (
    <AppShell
      back={{ to: "/automations", label: "Automações" }}
      title={workflow.name}
      action={
        <>
          <NavTabs
            aria-label="Secções do fluxo"
            items={TABS.map((t) => ({ id: t.key, label: t.label, count: t.key === "execucoes" && runs.length ? runs.length : null }))}
            value={tab}
            onChange={(key) => go({ tab: key, a: undefined })}
          />
          <ReadyStatus checks={checks} />
        </>
      }
      compact
    >
      {tab === "fluxo" && (
        // A altura deixa o mapa inteiro dentro da janela: os botões de zoom ficam sempre à vista, sem scroll da página.
        <div className={cn(full ? "fixed inset-0 z-50 bg-card p-3" : "relative h-[calc(100dvh-15.5rem)] min-h-[26rem] rounded-card bg-card md:h-[calc(100dvh-12rem)] lg:h-[calc(100dvh-8.5rem)]")}>
          <FlowMap
            full={full}
            onToggleFull={() => setFull((f) => !f)}
            automations={automations}
            canvas={canvas}
            forms={forms}
            webinar={workflow.webinars}
            counts={counts.data ?? null}
            stats={statsOf}
            focusId={search.a ? `auto:${search.a}` : undefined}
            onOpenAutomation={(id) => {
              setOpen(null);
              go({ a: id });
            }}
            onOpenStep={(automationId, nodeId) => {
              go({ a: undefined });
              setOpen({ kind: "step", automationId, nodeId });
            }}
            onAddAutomation={(trigger) => void addAutomation(trigger)}
            onEditCanvasNode={(node) => {
              go({ a: undefined });
              setOpen({ kind: "canvas", node });
            }}
            onOpenCapture={toConfig}
            onPickWebinar={toConfig}
            onUseModel={() => setModelOpen(true)}
            startEmpty={leftovers.length ? { count: leftovers.length, onStart: () => void startEmpty() } : undefined}
            onAddComponent={(component, at, automationId) => void addComponent(component, at, automationId)}
            onMoveNodes={(moves) => void saveCanvas({ ...canvas, positions: { ...canvas.positions, ...moves } })}
            onResetLayout={() => void saveCanvas({ ...canvas, positions: {} })}
            // Mudar o sentido recomeça as posições: as arrastadas num sentido não servem no outro.
            onSetOrientation={(orientation) => {
              if ((canvas.orientation ?? "vertical") !== orientation) void saveCanvas({ ...canvas, orientation, positions: {} });
            }}
          />
          {settings}
        </div>
      )}

      {tab === "execucoes" && (
        <RunsTable
          runs={runs}
          onOpen={(run: AutomationRun) => go({ run: run.id })}
          empty="Ainda sem execuções. Aparecem aqui quando alguém entrar numa automação ligada deste fluxo."
        />
      )}

      {tab === "configuracao" && (
        <WorkflowConfig
          workflow={workflow}
          forms={forms}
          status={status}
          groups={groups}
          onOpenGroup={(node) => setOpen({ kind: "canvas", node })}
          onAddGroup={() => void addComponent({ kind: "group" })}
          onArchived={() => void navigate({ to: "/automations" })}
        />
      )}

      {!onMap && settings}
      {modelOpen && (
        <ModelDialog open busy={busy} present={automations.map((a) => a.name)} onClose={() => setModelOpen(false)} onApply={(keys) => void applyModel(keys)} />
      )}
      <RunSheet run={openRun} onClose={() => go({ run: undefined })} />
    </AppShell>
  );
}

/** Configuração do fluxo: o webinar, a oferta, o grupo, os canais, a captura, o nome e o arquivo. */
function WorkflowConfig({
  workflow,
  forms,
  status,
  groups,
  onOpenGroup,
  onAddGroup,
  onArchived,
}: {
  workflow: Workflow;
  forms: RegistrationForm[];
  status: ChannelStatus[];
  groups: GroupNode[];
  /** Os grupos são nós do fluxo: abrem as mesmas definições que no desenho. */
  onOpenGroup: (node: GroupNode) => void;
  onAddGroup: () => void;
  onArchived: () => void;
}) {
  const invalidate = useInvalidate();
  const { data: webinars = [] } = useWebinars(workflow.organization_id);
  const { data: workflows = [] } = useWorkflows(workflow.organization_id);
  const [name, setName] = useState(workflow.name);
  const w = workflow.webinars;
  const title = w ? w.public_title || w.internal_name : "";
  // Um fluxo por webinar: os que já estão noutro fluxo ficam indisponíveis.
  const taken = (id: string) => workflows.some((f) => f.id !== workflow.id && f.webinar_id === id);

  const pickWebinar = async (value: string) => {
    const id = value === NONE ? null : value;
    if (id === workflow.webinar_id) return;
    try {
      await setWorkflowWebinar(workflow, id);
      invalidate(["workflows", "automations"]);
      toast.success(id ? "Webinar escolhido" : "Fluxo sem webinar", {
        description: id ? "As horas das mensagens já contam a partir das sessões dele." : "Fica em rascunho até escolher um webinar.",
      });
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível mudar o webinar."));
    }
  };
  const rename = async () => {
    try {
      await saveWorkflow(workflow.id, { name: name.trim() });
      invalidate(["workflows"]);
      toast.success("Nome guardado");
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível guardar."));
    }
  };
  const archive = async () => {
    try {
      await deactivateWorkflowAutomations(workflow.id);
      await saveWorkflow(workflow.id, { archived_at: new Date().toISOString() });
      invalidate(["workflows"]);
      toast.success("Fluxo arquivado. As automações e as execuções ficam guardadas.");
      onArchived();
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível arquivar."));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-card bg-card p-5">
        <h2 className="font-semibold">Webinar</h2>
        <p className="text-sm text-muted-foreground">O centro do fluxo: as horas das mensagens contam a partir das sessões dele.</p>
        <Select value={workflow.webinar_id ?? NONE} onValueChange={(v) => void pickWebinar(v)}>
          <SelectTrigger aria-label="Webinar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sem webinar (rascunho)</SelectItem>
            {webinars.map((x) => (
              <SelectItem key={x.id} value={x.id} disabled={taken(x.id)}>
                {x.public_title || x.internal_name}
                {taken(x.id) ? " · já tem fluxo" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {w && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/webinars/$webinarId/edit" params={{ webinarId: w.id }} search={{ step: "automacoes" }}>
              <ExternalLink /> Abrir o webinar
            </Link>
          </Button>
        )}
      </section>

      <section className="space-y-3 rounded-card bg-card p-5">
        <h2 className="font-semibold">Oferta</h2>
        <p className="text-sm">
          {!w ? (
            <span className="text-muted-foreground">Vem do webinar que escolher.</span>
          ) : w.cta_url ? (
            <>
              {w.cta_price_now && <span className="font-medium">{w.cta_price_now} · </span>}
              <span className="break-all">{w.cta_url}</span>
            </>
          ) : (
            <span className="text-warning">Por definir no webinar, no passo Oferta.</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          As mensagens usam {"{{link_oferta}}"} e {"{{preco}}"}. Sem o link, as mensagens que o usam não saem.
        </p>
      </section>

      <section className="space-y-3 rounded-card bg-card p-5">
        <h2 className="font-semibold">Grupos de WhatsApp</h2>
        {groups.length > 0 && (
          <ul className="divide-y divide-[var(--border-subtle)] rounded-md bg-white ring-1 ring-[var(--border-subtle)]">
            {groups.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => onOpenGroup(g)} className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50">
                  {g.url.trim() ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="text-xs text-muted-foreground">{g.url.trim() ? "Link pronto" : "Falta o link"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Cada mensagem nos grupos escolhe um ou vários. O grupo não separa quem já comprou: serve para lembretes e replay.
        </p>
        <Button variant="outline" onClick={onAddGroup}>
          <Plus /> Adicionar grupo
        </Button>
      </section>

      <section className="space-y-3 rounded-card bg-card p-5">
        <h2 className="font-semibold">Canais</h2>
        <ul className="divide-y divide-[var(--border-subtle)] rounded-md bg-white ring-1 ring-[var(--border-subtle)]">
          {status.map((s) => (
            <li key={s.channel} className="flex items-center gap-3 px-3 py-2 text-sm">
              {s.ready ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />}
              <span className="flex-1">{CHANNELS[s.channel].label}</span>
              <span className="text-xs text-muted-foreground">{s.note}</span>
            </li>
          ))}
        </ul>
        <Link to="/integrations" className="inline-block text-sm font-medium text-primary hover:underline">
          Abrir Integrações
        </Link>
      </section>

      {w && (
        <div className="lg:col-span-2">
          <CapturePanel forms={forms} webinarTitle={title} />
        </div>
      )}

      <section className="space-y-3 rounded-card bg-card p-5 lg:col-span-2">
        <h2 className="font-semibold">Nome do fluxo</h2>
        <div className="flex max-w-xl gap-2">
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!name.trim() || name.trim() === workflow.name} onClick={() => void rename()}>
            Guardar
          </Button>
        </div>
        <h2 className="pt-3 font-semibold">Arquivar</h2>
        <p className="text-sm text-muted-foreground">
          Sai da lista. As automações e o histórico ficam guardados; desligue as automações antes, se não quiser que continuem a correr.
        </p>
        <Button variant="outline" onClick={() => void archive()}>
          <Archive /> Arquivar fluxo
        </Button>
      </section>
    </div>
  );
}
