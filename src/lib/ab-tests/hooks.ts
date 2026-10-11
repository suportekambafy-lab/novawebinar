import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyWinner, createAbTest, duplicateAbTest, getAbTest, listAbTests, updateAbTestStatus } from "./ab-tests.functions";
import type { CreateAbTestInput } from "./model";

/** Os testes da organização, com métricas; actualizam-se de minuto a minuto enquanto a página está aberta. */
export function useAbTests(organizationId: string | undefined) {
  const list = useServerFn(listAbTests);
  return useQuery({
    queryKey: ["ab-tests", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 60_000,
    queryFn: () => list({ data: { organizationId: organizationId! } }),
  });
}

export function useAbTest(testId: string | undefined) {
  const get = useServerFn(getAbTest);
  return useQuery({
    queryKey: ["ab-test", testId],
    enabled: Boolean(testId),
    refetchInterval: 30_000,
    queryFn: () => get({ data: { testId: testId! } }),
  });
}

/** Os testes activos em que este webinar é variante: o editor avisa antes de o deixar mexer. */
export function useActiveAbTestsOfWebinar(webinarId: string | undefined) {
  return useQuery({
    queryKey: ["ab-tests", "webinar", webinarId],
    enabled: Boolean(webinarId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data: variants, error } = await supabase.from("ab_test_variants").select("label, ab_test_id").eq("webinar_id", webinarId!);
      if (error || !variants?.length) return [];
      const { data: tests } = await supabase
        .from("ab_tests")
        .select("id, name")
        .in("id", variants.map((v) => v.ab_test_id))
        .eq("status", "active");
      return (tests ?? []).map((t) => ({ id: t.id, name: t.name, label: variants.find((v) => v.ab_test_id === t.id)?.label ?? "" }));
    },
  });
}

/** Cria, muda o estado, aplica a vencedora ou duplica, e refresca as listas. */
export function useAbTestActions() {
  const queryClient = useQueryClient();
  const create = useServerFn(createAbTest);
  const status = useServerFn(updateAbTestStatus);
  const winner = useServerFn(applyWinner);
  const duplicate = useServerFn(duplicateAbTest);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ab-tests"] }).then(() => queryClient.invalidateQueries({ queryKey: ["ab-test"] }));
  return {
    create: useMutation({
      mutationFn: (input: CreateAbTestInput & { organizationId: string }) => create({ data: input }),
      onSuccess: refresh,
    }),
    status: useMutation({
      mutationFn: (input: { testId: string; action: "start" | "pause" | "resume" | "complete" | "archive" }) => status({ data: input }),
      onSuccess: refresh,
    }),
    winner: useMutation({
      mutationFn: (input: { testId: string; variantId: string }) => winner({ data: input }),
      onSuccess: refresh,
    }),
    duplicate: useMutation({
      mutationFn: (input: { testId: string }) => duplicate({ data: input }),
      onSuccess: refresh,
    }),
  };
}
