import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createSmartLink, deleteSmartLink, listSmartLinks, updateSmartLink } from "./intelligence.functions";
import type { SmartLinkInput } from "./model";

/** Os links do Webinar Intelligence da organização, com as visitas; refrescam de minuto a minuto. */
export function useSmartLinks(organizationId: string | undefined) {
  const list = useServerFn(listSmartLinks);
  return useQuery({
    queryKey: ["smart-links", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 60_000,
    queryFn: () => list({ data: { organizationId: organizationId! } }),
  });
}

export function useSmartLinkActions() {
  const queryClient = useQueryClient();
  const create = useServerFn(createSmartLink);
  const update = useServerFn(updateSmartLink);
  const remove = useServerFn(deleteSmartLink);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["smart-links"] });
  return {
    create: useMutation({
      mutationFn: (input: SmartLinkInput & { organizationId: string }) => create({ data: input }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (input: { linkId: string; patch: Partial<SmartLinkInput> & { status?: "active" | "paused" } }) => update({ data: input }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (linkId: string) => remove({ data: { linkId } }),
      onSuccess: refresh,
    }),
  };
}
