import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNews, useRefreshNews, type NewsItem } from "@/lib/news";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, RefreshCw, ExternalLink } from "lucide-react";

const SENTIMENT: Record<
  string,
  { label: string; className: string }
> = {
  positive: { label: "positiva", className: "bg-emerald-500/10 text-emerald-500" },
  negative: { label: "negativa", className: "bg-red-500/10 text-red-500" },
  neutral: { label: "neutral", className: "bg-secondary text-muted-foreground" },
};

export function NewsFeed({
  symbol,
  title = "Noticias",
}: {
  symbol?: string;
  title?: string;
}) {
  const news = useNews(symbol);
  const refresh = useRefreshNews();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="h-4 w-4" />
          {title}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          <RefreshCw
            className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`}
          />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent>
        {news.isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : news.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            No se pudieron cargar las noticias.
          </p>
        ) : (news.data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no hay noticias guardadas.
            </p>
            <Button
              size="sm"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`}
              />
              Traer noticias
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {news.data!.map((item) => (
              <NewsRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const sent = SENTIMENT[item.sentiment ?? "neutral"] ?? SENTIMENT.neutral;
  let when = "";
  try {
    when = formatDistanceToNow(new Date(item.published_at), {
      addSuffix: true,
      locale: es,
    });
  } catch {
    when = "";
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col gap-1"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-snug transition-colors group-hover:text-primary">
            {item.headline}
          </span>
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {item.symbol && item.symbol !== "CRYPTO" && (
            <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">
              {item.symbol}
            </span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 font-medium ${sent.className}`}
          >
            {sent.label}
          </span>
          {item.source && <span>{item.source}</span>}
          {when && <span>· {when}</span>}
        </div>
      </a>
    </li>
  );
}
