import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Ellipsis, Eye, ListPlus, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ContactAutomations } from "@/components/automation-runs";
import {
  ContactFileView,
  ContactList,
  ContactsFrame,
  GroupSummary,
  ListChips,
  ScopeNav,
  ScopePicker,
  type ContactsStep,
  type ScopeGroup,
} from "@/components/contacts/contacts-view";
import { ExampleContacts } from "@/components/contacts/example";
import { ImportContactsDialog } from "@/components/contacts/import-dialog";
import { SegmentDialog } from "@/components/contacts/segment-dialog";
import { EmptyState } from "@/components/ds/data";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { contactInsight, sourceLabel, stageLabel, TEMPERATURE_LABEL, type ContactSummary } from "@/lib/contacts";
import {
  contactFile,
  filterContacts,
  launchLabel,
  sourceRowsOf,
  stageCountsOf,
  themeGroups,
} from "@/lib/contacts-journey";
import {
  CONTACTS_PAGE_SIZE,
  fetchAllContacts,
  switchWorkspace,
  useContactDetail,
  useContactLists,
  useContacts,
  useContactSources,
  useContactStageCounts,
  useInvalidate,
  useWebinars,
  useWorkspace,
  watchLabel,
  type ContactList as SavedList,
} from "@/lib/data";
import { segmentSentence } from "@/lib/segments";
import { useContactContext, useContactConversations } from "@/lib/support/hooks";
import { intentLabel, statusLabel } from "@/lib/support/model";
import { downloadCsv, toCsv } from "@/lib/webinar-metrics";

/** `contact`: abre a ficha (ligações do Painel, das automações, do Atendimento). `exemplo`: pessoas fictícias, só no ecrã. */
type Search = { contact?: string | undefined; exemplo?: 1 | undefined };

export const Route = createFileRoute("/contacts")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["contact"] === "string" ? { contact: search["contact"] } : {}),
    ...(search["exemplo"] === 1 || search["exemplo"] === "1" ? { exemplo: 1 as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Contactos | Novawebinar" },
      { name: "description", content: "Todas as pessoas, por lançamento, e a jornada de cada uma." },
    ],
  }),
  component: ContactsPage,
});

const ALL = "all";

function ContactsPage() {
  const { contact: linkedId, exemplo } = Route.useSearch();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const invalidate = useInvalidate();

  const [scope, setScope] = useState(ALL);
  const [stage, setStage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(linkedId ?? null);
  const [step, setStep] = useState<ContactsStep>(linkedId ? "detail" : "list");
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Diálogo do segmento: null fechado; { segment: null } novo; { segment } a editar.
  const [segmentDialog, setSegmentDialog] = useState<{ segment: SavedList | null } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => {
    setPage(0);
    setSelected((s) => (s ? new Set() : s));
  }, [scope, stage, search]);
  useEffect(() => {
    if (linkedId) {
      setOpenId(linkedId);
      setStep("detail");
    }
  }, [linkedId]);

  const [kind, scopeId = null] = scope.split(":") as [string, string | undefined];
  const listId = kind === "list" || kind === "segment" ? scopeId : null;
  const webinarId = kind === "launch" ? scopeId : null;
  const theme = kind === "theme" ? scopeId : null;

  const { data: lists = [] } = useContactLists(exemplo ? undefined : orgId);
  const manualLists = lists.filter((l) => l.kind === "manual");
  const segments = lists.filter((l) => l.kind === "smart");
  const currentList = lists.find((l) => l.id === listId) ?? null;
  const { data: webinars = [] } = useWebinars(exemplo ? undefined : orgId);
  const titleOf = (id: string) => {
    const w = webinars.find((x) => x.id === id);
    return w ? w.public_title || w.internal_name : undefined;
  };
  const { data: themes = [] } = useContactThemes(exemplo ? undefined : orgId);
  const themeIds = themes.find((t) => t.id === theme)?.contactIds ?? [];
  const { data: launchCounts } = useLaunchCounts(exemplo ? undefined : orgId, webinars.map((w) => w.id));

  const serverScope = exemplo || theme ? undefined : orgId;
  const { data: serverCounts } = useContactStageCounts(serverScope, listId, webinarId);
  const { data: serverSources } = useContactSources(serverScope, listId, webinarId);
  const { data: page$, isLoading, error: pageError } = useContacts(serverScope, { stage, listId, webinarId, search, page });
  const { data: themeRows = [], isLoading: themeLoading } = useThemeContacts(theme ? orgId : undefined, themeIds);
  const rows = theme ? filterContacts(themeRows, { stage, search }) : (page$?.rows ?? []);
  const inRows = rows.some((r) => r.id === openId);
  const { data: linked } = useLinkedContact(exemplo || inRows ? undefined : openId, orgId);

  const total = theme ? (themeLoading ? null : rows.length) : page$ ? page$.total : null;
  const counts = theme ? stageCountsOf(themeRows) : serverCounts;
  const sources = theme ? sourceRowsOf(themeRows) : serverSources;
  const pages = theme ? 1 : Math.max(1, Math.ceil((page$?.total ?? 0) / CONTACTS_PAGE_SIZE));
  const open = openId ? (rows.find((r) => r.id === openId) ?? linked ?? null) : null;

  const groups: ScopeGroup[] = [
    { id: "all", items: [{ key: ALL, kind: "all", label: "Todos os contactos" }] },
    {
      id: "launches",
      title: "Lançamentos",
      items: webinars
        // Sem contagem (além das 30 primeiras), o lançamento aparece na mesma.
        .filter((w) => !launchCounts || (launchCounts[w.id] ?? 1) > 0)
        .map((w) => ({
          key: `launch:${w.id}`,
          kind: "launch" as const,
          label: w.public_title || w.internal_name,
          count: launchCounts?.[w.id] ?? null,
        })),
    },
    {
      id: "themes",
      title: "Temas das conversas",
      items: themes.map((t) => ({ key: `theme:${t.id}`, kind: "theme" as const, label: t.label, count: t.contactIds.length })),
    },
    {
      id: "lists",
      title: "Listas",
      items: manualLists.map((l) => ({ key: `list:${l.id}`, kind: "list" as const, label: l.name })),
      empty: "Junte pessoas à mão ou importe uma folha.",
      add: { label: "Nova lista", onClick: () => void createList() },
    },
    {
      id: "segments",
      title: "Segmentos",
      items: segments.map((l) => ({ key: `segment:${l.id}`, kind: "segment" as const, label: l.name })),
      empty: "Regras sobre o que a pessoa fez e de onde veio: quem as cumpre entra sozinho.",
      add: { label: "Novo segmento", onClick: () => setSegmentDialog({ segment: null }) },
    },
  ];
  const scopeLabel = groups.flatMap((g) => g.items).find((i) => i.key === scope)?.label ?? "Todos os contactos";

  const pickScope = (key: string) => {
    setScope(key);
    setStage(null);
  };
  const openContact = (id: string | null) => {
    setOpenId(id);
    setStep(id ? "detail" : "list");
    if (!id && linkedId) void navigate({ to: "/contacts", search: {}, replace: true });
  };
  const showSummary = () => {
    openContact(null);
    setStep("detail");
  };
  const setExample = (on: boolean) => void navigate({ to: "/contacts", search: on ? { exemplo: 1 } : {}, replace: true });

  const createList = async () => {
    const name = window.prompt("Nome da nova lista")?.trim();
    if (!name || !orgId) return;
    const { data: created, error } = await supabase
      .from("contact_lists")
      .insert({ organization_id: orgId, name })
      .select("id")
      .single();
    if (error) {
      toast.error(error.code === "23505" ? "Já existe uma lista com esse nome." : "Não foi possível criar a lista.");
      return;
    }
    invalidate(["contacts"]);
    pickScope(`list:${created.id}`);
  };

  const deleteList = async (id: string) => {
    if (!window.confirm("Apagar? Os contactos continuam guardados.")) return;
    const { error } = await supabase.from("contact_lists").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível apagar.");
      return;
    }
    pickScope(ALL);
    invalidate(["contacts"]);
  };

  const addSelectedTo = async (targetList: string) => {
    if (!orgId || !selected?.size) return;
    const { error } = await supabase.from("contact_list_members").upsert(
      [...selected].map((contactId) => ({ list_id: targetList, contact_id: contactId, organization_id: orgId })),
      { onConflict: "list_id,contact_id", ignoreDuplicates: true },
    );
    if (error) {
      toast.error("Não foi possível juntar à lista.");
      return;
    }
    toast.success(`${selected.size} ${selected.size === 1 ? "pessoa juntada" : "pessoas juntadas"} à lista.`);
    setSelected(null);
    invalidate(["contacts"]);
  };

  const removeSelectedFromList = async () => {
    if (!listId || !selected?.size) return;
    const { error } = await supabase
      .from("contact_list_members")
      .delete()
      .eq("list_id", listId)
      .in("contact_id", [...selected]);
    if (error) {
      toast.error("Não foi possível tirar da lista.");
      return;
    }
    setSelected(null);
    invalidate(["contacts"]);
  };

  const exportCsv = async () => {
    if (!orgId) return;
    setExporting(true);
    try {
      const all = theme ? rows : await fetchAllContacts(orgId, { stage, listId, webinarId, search });
      const content = toCsv(
        ["Nome", "Email", "Telefone", "Etapa", "Temperatura", "Motivo", "Próxima acção", "Lançamentos", "Esteve presente", "Tempo a ver", "Compras", "Última actividade", "Origem", "Campanha"],
        all.map((c) => {
          const i = contactInsight(c);
          return [
            c.name,
            c.email,
            c.phone,
            stageLabel(i.stage),
            TEMPERATURE_LABEL[i.temperature],
            i.reason,
            i.nextAction.label,
            c.events_registered,
            c.events_attended,
            watchLabel(c.watched_seconds ?? 0),
            c.purchases,
            c.last_seen_at,
            sourceLabel(c.first_source),
            c.first_campaign,
          ];
        }),
      );
      downloadCsv(`contactos-${new Date().toISOString().slice(0, 10)}.csv`, content);
    } catch {
      toast.error("Não foi possível exportar.");
    } finally {
      setExporting(false);
    }
  };

  const header = (
    <div className="flex gap-2">
      {!exemplo && (
        <Button variant="outline" onClick={() => setExample(true)}>
          <Eye /> Ver exemplo
        </Button>
      )}
      <Button onClick={() => setImportOpen(true)} disabled={!orgId || Boolean(exemplo)}>
        <Upload /> Importar
      </Button>
    </div>
  );

  const nobody = !exemplo && scope === ALL && serverCounts?.all === 0;
  const testOrg = workspace?.organizations.find((o) => o.isTest && o.id !== orgId);

  return (
    <AppShell title="Contactos" action={header} compact>
      {exemplo ? (
        <ExampleContacts onExit={() => setExample(false)} />
      ) : !orgId ? (
        <Skeleton className="h-[32rem] w-full" />
      ) : nobody ? (
        <EmptyState
          icon={Users}
          title="Ainda sem contactos"
          description="Quem se inscrever num webinar aparece aqui, com o que viu e o que comprou. Também pode importar os contactos que já tem."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setImportOpen(true)}>
                <Upload /> Importar contactos
              </Button>
              <Button variant="outline" onClick={() => setExample(true)}>
                <Eye /> Ver um exemplo
              </Button>
              {testOrg && (
                <Button variant="outline" onClick={() => switchWorkspace(testOrg.id)}>
                  Ver a conta de teste
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <ContactsFrame
          step={step}
          nav={<ScopeNav groups={groups} active={scope} onSelect={pickScope} />}
          list={
            <ContactList
              title={scopeLabel}
              total={total}
              note={
                currentList?.kind === "smart" && currentList.rules
                  ? `entra quem ${segmentSentence(currentList.rules, titleOf)}`
                  : null
              }
              picker={<ScopePicker groups={groups} active={scope} onSelect={pickScope} />}
              tools={
                <>
                  <Button variant="outline" size="sm" className="@2xl:hidden" onClick={showSummary}>
                    Resumo
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Mais acções">
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setSelected(new Set())}>
                        <ListPlus /> Seleccionar pessoas
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void exportCsv()} disabled={exporting || !total}>
                        {exporting ? "A exportar…" : "Exportar este grupo (CSV)"}
                      </DropdownMenuItem>
                      {currentList && (
                        <>
                          <DropdownMenuSeparator />
                          {currentList.kind === "smart" && (
                            <DropdownMenuItem onSelect={() => setSegmentDialog({ segment: currentList })}>
                              Editar as regras
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => void deleteList(currentList.id)} className="text-destructive">
                            {currentList.kind === "smart" ? "Apagar o segmento" : "Apagar a lista"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
              search={searchInput}
              onSearch={setSearchInput}
              counts={counts}
              stage={stage}
              onStage={setStage}
              rows={rows.map((c) => ({ contact: c, launch: launchLabel(c.webinar_ids, titleOf) }))}
              activeId={openId}
              onSelect={openContact}
              loading={theme ? themeLoading : isLoading}
              // Uma consulta falhada não pode parecer uma lista vazia: diz-se que não carregou.
              empty={pageError ? "Não foi possível carregar os contactos. Tente novamente." : search || stage ? "Ninguém com este filtro." : "Ninguém neste grupo ainda."}
              selection={
                selected
                  ? {
                      selected,
                      onToggle: (id) => {
                        const next = new Set(selected);
                        if (!next.delete(id)) next.add(id);
                        setSelected(next);
                      },
                    }
                  : undefined
              }
              bulk={
                selected && (
                  <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 px-3 py-2 text-[13px]">
                    <span className="mr-auto font-medium tabular-nums">
                      {selected.size} {selected.size === 1 ? "seleccionada" : "seleccionadas"}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" disabled={selected.size === 0}>
                          Juntar a lista
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {manualLists.length === 0 && (
                          <DropdownMenuItem onSelect={() => void createList()}>Criar a primeira lista…</DropdownMenuItem>
                        )}
                        {manualLists.map((l) => (
                          <DropdownMenuItem key={l.id} onSelect={() => void addSelectedTo(l.id)}>
                            {l.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {currentList?.kind === "manual" && (
                      <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={() => void removeSelectedFromList()}>
                        Tirar da lista
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      Cancelar
                    </Button>
                  </div>
                )
              }
              footer={
                pages > 1 && (
                  <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[12px] text-muted-foreground">
                    <span className="tabular-nums">
                      Página {page + 1} de {pages}
                    </span>
                    <span className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-10" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior">
                        <ChevronLeft />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-10" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Página seguinte">
                        <ChevronRight />
                      </Button>
                    </span>
                  </div>
                )
              }
            />
          }
          detail={
            open ? (
              <RealContactFile
                key={open.id}
                contact={open}
                lists={manualLists}
                segments={segments}
                titleOf={titleOf}
                onOpenConversation={(id) => void navigate({ to: "/support", search: { c: id } })}
                onBack={() => openContact(null)}
              />
            ) : openId && !linked ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <GroupSummary
                title={scopeLabel}
                counts={counts}
                sources={sources}
                stage={stage}
                onStage={setStage}
                onBack={() => setStep("list")}
              />
            )
          }
        />
      )}

      {segmentDialog && orgId && (
        <SegmentDialog
          organizationId={orgId}
          webinars={webinars}
          segment={
            segmentDialog.segment?.rules
              ? { id: segmentDialog.segment.id, name: segmentDialog.segment.name, rules: segmentDialog.segment.rules }
              : null
          }
          onClose={() => setSegmentDialog(null)}
          onSaved={(id) => {
            setSegmentDialog(null);
            pickScope(`segment:${id}`);
          }}
        />
      )}
      {importOpen && orgId && (
        <ImportContactsDialog
          open
          onOpenChange={setImportOpen}
          organizationId={orgId}
          lists={manualLists}
          defaultListId={currentList?.kind === "manual" ? listId : null}
        />
      )}
    </AppShell>
  );
}

/** A ficha de uma pessoa real: junta as três leituras que o Atendimento também usa. */
function RealContactFile({
  contact,
  lists,
  segments,
  titleOf,
  onOpenConversation,
  onBack,
}: {
  contact: ContactSummary;
  lists: SavedList[];
  segments: SavedList[];
  titleOf: (id: string) => string | undefined;
  onOpenConversation: (id: string) => void;
  onBack: () => void;
}) {
  const id = contact.id ?? null;
  const invalidate = useInvalidate();
  const { data: detail, isLoading } = useContactDetail(id);
  const { data: ctx, isLoading: ctxLoading } = useContactContext(id);
  const { data: talks } = useContactConversations(id, detail?.origins.map((o) => o.id) ?? []);

  const file = useMemo(
    () =>
      contactFile({
        contact,
        context: ctx?.context ?? null,
        steps: detail?.journey ?? [],
        origins: detail?.origins ?? [],
        timeline: detail?.timeline ?? [],
        titles: detail?.webinarTitles ?? new Map(),
        talks: (talks?.talks ?? []).map((t) => ({
          id: t.id,
          at: t.last_message_at,
          title: t.webinars?.public_title ?? "Conversa",
          preview: t.last_message_preview || null,
          cases: talks!.cases
            .filter((k) => k.conversation_id === t.id)
            .map((k) => `Caso ${k.number} · ${intentLabel(k.intent)} · ${statusLabel(k.status)}`),
        })),
        place: detail?.place ?? "",
        device: detail?.device ?? "",
      }),
    [contact, ctx, detail, talks],
  );

  const setMembership = async (listId: string, add: boolean) => {
    const { error } = add
      ? await supabase
          .from("contact_list_members")
          .insert({ list_id: listId, contact_id: id!, organization_id: contact.organization_id! })
      : await supabase.from("contact_list_members").delete().eq("list_id", listId).eq("contact_id", id!);
    if (error) toast.error("Não foi possível actualizar a lista.");
    invalidate(["contacts"]);
  };

  const inLists = lists.filter((l) => detail?.listIds.includes(l.id));
  return (
    <ContactFileView
      file={file}
      loading={isLoading || ctxLoading}
      lists={
        <ListChips
          lists={inLists}
          segments={segments
            .filter((s) => detail?.segmentIds.includes(s.id))
            .map((s) => ({ id: s.id, name: s.name, why: s.rules ? segmentSentence(s.rules, titleOf) : undefined }))}
          addable={lists.filter((l) => !detail?.listIds.includes(l.id))}
          onAdd={(listId) => void setMembership(listId, true)}
          onRemove={(listId) => void setMembership(listId, false)}
        />
      }
      automations={<ContactAutomations contactId={id} />}
      onOpenConversation={onOpenConversation}
      onBack={onBack}
    />
  );
}

/** O contacto de uma ligação directa, mesmo que não esteja na página visível da lista. */
function useLinkedContact(contactId: string | null | undefined, organizationId: string | undefined) {
  return useQuery({
    queryKey: ["contacts", "one", contactId, organizationId],
    enabled: Boolean(contactId && organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_summaries")
        .select("*")
        .eq("id", contactId!)
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ContactSummary | null;
    },
  });
}

/** Quantas pessoas tem cada lançamento (a mesma conta que a lista faz ao abri-lo). */
function useLaunchCounts(organizationId: string | undefined, webinarIds: string[]) {
  // ponytail: uma contagem por webinar; passa a uma função na base se a conta tiver dezenas de lançamentos.
  const ids = webinarIds.slice(0, 30);
  return useQuery({
    queryKey: ["contacts", "launch-counts", organizationId, ids.join(",")],
    enabled: Boolean(organizationId) && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await Promise.all(
        ids.map(async (id) => {
          const { count } = await supabase
            .from("contact_summaries")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId!)
            .contains("webinar_ids", [id]);
          return [id, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(rows) as Record<string, number>;
    },
  });
}

/** Os temas das conversas (os casos do Atendimento), com as pessoas de cada um. Sem acesso aos casos, não há temas. */
function useContactThemes(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["contacts", "themes", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_cases")
        .select("contact_id, intent")
        .eq("organization_id", organizationId!)
        .not("contact_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      return error ? [] : themeGroups(data ?? []);
    },
  });
}

/** As pessoas de um tema: poucas, lidas de uma vez e filtradas no ecrã. */
function useThemeContacts(organizationId: string | undefined, ids: string[]) {
  // ponytail: até 200 pessoas por tema (o limite do endereço do pedido); paginar se um tema passar disso.
  const some = ids.slice(0, 200);
  return useQuery({
    queryKey: ["contacts", "by-ids", organizationId, some.join(",")],
    enabled: Boolean(organizationId) && some.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_summaries")
        .select("*")
        .eq("organization_id", organizationId!)
        .in("id", some)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactSummary[];
    },
  });
}
