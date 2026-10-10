import { createFileRoute, notFound } from "@tanstack/react-router";
import { FeaturePage } from "@/components/feature-page";
import { findFeature, landingFeatures } from "@/lib/landing-features";

export const Route = createFileRoute("/funcionalidades/$slug")({
  loader: ({ params }) => {
    const feature = findFeature(params.slug);
    if (!feature) throw notFound();
    return { feature };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Funcionalidade não encontrada — Novawebinar" }, { name: "robots", content: "noindex" }] };
    }
    const { feature } = loaderData;
    return {
      meta: [
        { title: feature.metaTitle },
        { name: "description", content: feature.metaDescription },
        { property: "og:title", content: feature.metaTitle },
        { property: "og:description", content: feature.metaDescription },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: FeatureNotFound,
  component: FeatureRoute,
});

function FeatureRoute() {
  const { feature } = Route.useLoaderData();
  return <FeaturePage feature={feature} />;
}

function FeatureNotFound() {
  const first = landingFeatures[0]!;
  return <FeaturePage feature={first} />;
}
