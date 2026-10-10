import { createFileRoute } from "@tanstack/react-router";
import { InternalWebinarRoom } from "@/components/webinar-room-internal";
import { ROOM_VIEWPORT } from "@/lib/room-viewport";

export const Route = createFileRoute("/live/$webinarId")({
  head: () => ({
    meta: [
      { title: "Sala ao vivo | Novawebinar" },
      ROOM_VIEWPORT,
      { name: "description", content: "Sala de webinar ao vivo Novawebinar." },
      { property: "og:title", content: "Sala ao vivo | Novawebinar" },
      { property: "og:description", content: "Participe no webinar ao vivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveRoom,
});

function LiveRoom() {
  const { webinarId } = Route.useParams();
  return <InternalWebinarRoom webinarId={webinarId} mode="live" />;
}
