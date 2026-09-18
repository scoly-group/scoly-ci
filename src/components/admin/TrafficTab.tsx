import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Globe,
  Users,
  Eye,
  MapPin,
  Loader2,
  RefreshCw,
  Smartphone,
  Building2,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

type Period = "7" | "30" | "90";

interface DayRow { day: string; views: number; visitors: number }
interface CountryRow { country: string; country_code: string | null; views: number; visitors: number }
interface CityRow { city: string; country: string; views: number }
interface PageRow { path: string; views: number }
interface DeviceRow { device: string; views: number }

interface Overview {
  total_counter: number;
  page_views: number;
  unique_visitors: number;
  countries_count: number;
  by_day: DayRow[];
  by_country: CountryRow[];
  by_city: CityRow[];
  by_page: PageRow[];
  by_device: DeviceRow[];
}

const EMPTY: Overview = {
  total_counter: 0,
  page_views: 0,
  unique_visitors: 0,
  countries_count: 0,
  by_day: [],
  by_country: [],
  by_city: [],
  by_page: [],
  by_device: [],
};

/** Drapeau emoji à partir du code ISO à deux lettres. */
const flagOf = (code?: string | null) => {
  if (!code || code.length !== 2) return "🏳️";
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)),
  );
};

const num = (v: unknown) => Number(v ?? 0);

const normalize = (raw: any): Overview => {
  if (!raw || typeof raw !== "object") return EMPTY;
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    total_counter: num(raw.total_counter),
    page_views: num(raw.page_views),
    unique_visitors: num(raw.unique_visitors),
    countries_count: num(raw.countries_count),
    by_day: arr(raw.by_day).map((d: any) => ({
      day: String(d.day ?? ""),
      views: num(d.views),
      visitors: num(d.visitors),
    })),
    by_country: arr(raw.by_country).map((c: any) => ({
      country: String(c.country ?? "Inconnu"),
      country_code: c.country_code ?? null,
      views: num(c.views),
      visitors: num(c.visitors),
    })),
    by_city: arr(raw.by_city).map((c: any) => ({
      city: String(c.city ?? "Inconnu"),
      country: String(c.country ?? ""),
      views: num(c.views),
    })),
    by_page: arr(raw.by_page).map((p: any) => ({ path: String(p.path ?? "/"), views: num(p.views) })),
    by_device: arr(raw.by_device).map((d: any) => ({
      device: String(d.device ?? "inconnu"),
      views: num(d.views),
    })),
  };
};

const DEVICE_LABELS: Record<string, string> = {
  mobile: "Mobile",
  desktop: "Ordinateur",
  tablet: "Tablette",
  inconnu: "Inconnu",
  unknown: "Inconnu",
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  tone: string;
}) => (
  <Card className="overflow-hidden border-border/60">
    <CardContent className="flex items-center gap-4 p-5">
      <div className={`rounded-xl p-3 ${tone}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-display font-bold">{value.toLocaleString("fr-FR")}</p>
      </div>
    </CardContent>
  </Card>
);

const TrafficTab = () => {
  const [period, setPeriod] = useState<Period>("30");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Overview>(EMPTY);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    const { data: rpcData, error } = await supabase.rpc("get_traffic_overview", {
      _days: Number(period),
    });
    if (error) {
      console.error("get_traffic_overview error:", error);
      setData(EMPTY);
    } else {
      setData(normalize(rpcData));
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const chartData = useMemo(
    () =>
      data.by_day.map((d) => ({
        ...d,
        label: d.day
          ? new Date(d.day).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
          : "",
      })),
    [data.by_day],
  );

  const maxCountry = Math.max(1, ...data.by_country.map((c) => c.views));

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold text-foreground">Trafic</h1>
          <p className="text-muted-foreground text-sm">
            Visites du site et géolocalisation des visiteurs
          </p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
            <SelectTrigger className="h-10 w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 derniers jours</SelectItem>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="shrink-0" onClick={fetchOverview} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              icon={TrendingUp}
              label="Visites"
              value={data.total_counter}
              tone="bg-primary/10 text-primary"
            />
            <StatCard
              icon={Eye}
              label="Pages vues (période)"
              value={data.page_views}
              tone="bg-amber-500/10 text-amber-600"
            />
            <StatCard
              icon={Users}
              label="Visiteurs uniques"
              value={data.unique_visitors}
              tone="bg-blue-500/10 text-blue-600"
            />
            <StatCard
              icon={MapPin}
              label="Pays"
              value={data.countries_count}
              tone="bg-emerald-500/10 text-emerald-600"
            />
          </div>

          <Card className="min-w-0 border-border/60">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Évolution des visites</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden px-2 sm:px-6">
              {chartData.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">
                  Aucune visite enregistrée sur cette période.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280} minWidth={0}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="traffic-views" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                      }}
                      formatter={(v: number, name) => [
                        v,
                        name === "views" ? "Pages vues" : "Visiteurs",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      fill="url(#traffic-views)"
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      stroke="hsl(var(--secondary))"
                      strokeWidth={2}
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="min-w-0 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Globe size={16} /> Pays
                </CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 space-y-3">
                {data.by_country.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                ) : (
                  data.by_country.slice(0, 10).map((c, i) => (
                    <div key={`${c.country}-${i}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="text-lg leading-none">{flagOf(c.country_code)}</span>
                          <span className="truncate">{c.country}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {c.views.toLocaleString("fr-FR")} vues · {c.visitors.toLocaleString("fr-FR")} visiteurs
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, (c.views / maxCountry) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Building2 size={16} /> Ville
                </CardTitle>
              </CardHeader>
              <CardContent className="min-w-0">
                {data.by_city.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                ) : (
                  <ul className="space-y-2">
                    {data.by_city.slice(0, 10).map((c, i) => (
                      <li
                        key={`${c.city}-${i}`}
                        className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0"
                      >
                        <span className="truncate min-w-0">
                          {c.city}
                          {c.country ? <span className="text-muted-foreground"> · {c.country}</span> : null}
                        </span>
                        <span className="shrink-0 font-medium text-primary">{c.views.toLocaleString("fr-FR")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Globe size={16} /> Pages les plus vues
                </CardTitle>
              </CardHeader>
              <CardContent className="min-w-0">
                {data.by_page.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                ) : (
                  <ul className="space-y-2">
                    {data.by_page.slice(0, 10).map((p, i) => (
                      <li
                        key={`${p.path}-${i}`}
                        className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0"
                      >
                        <span className="truncate min-w-0" title={p.path}>{p.path}</span>
                        <span className="shrink-0 font-medium text-primary">{p.views.toLocaleString("fr-FR")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Smartphone size={16} /> Appareil
                </CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden">
                {data.by_device.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220} minWidth={0}>
                    <BarChart
                      data={data.by_device.map((d) => ({
                        label: DEVICE_LABELS[d.device] ?? d.device,
                        views: d.views,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                        }}
                      />
                      <Bar dataKey="views" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default TrafficTab;
