import { useListCompanies } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TaxBadge({ regime }: { regime: string }) {
  const map: Record<string, { label: string; className: string }> = {
    vat: { label: "VAT", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
    gst: { label: "GST", className: "bg-orange-100 text-orange-800 hover:bg-orange-100" },
    none: { label: "None", className: "bg-slate-100 text-slate-800 hover:bg-slate-100" },
  };

  const badgeInfo = map[regime.toLowerCase()] || { label: regime, className: "bg-slate-100 text-slate-800" };

  return (
    <Badge variant="secondary" className={badgeInfo.className} data-testid={`badge-tax-${regime}`}>
      {badgeInfo.label}
    </Badge>
  );
}

export function CountryDisplay({ country }: { country: string }) {
  const flags: Record<string, string> = {
    Germany: "🇩🇪",
    India: "🇮🇳",
  };

  return (
    <span className="inline-flex items-center gap-1.5" data-testid={`display-country-${country}`}>
      <span className="text-base leading-none" aria-hidden="true">{flags[country] || "🌐"}</span>
      <span>{country}</span>
    </span>
  );
}

export default function Companies() {
  const { data: companies, isLoading, isError } = useListCompanies();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500">Manage all registered entities across jurisdictions.</p>
        </div>
        <Button disabled>
          <Plus className="h-4 w-4 mr-2" /> Add Company
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError || !companies ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load companies.
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No companies</h3>
          <p className="mt-1 text-sm text-slate-500">Get started by creating a new company.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {companies.map((company) => (
            <Link key={company.id} href={`/companies/${company.id}`}>
              <a data-testid={`card-company-${company.id}`} className="block group">
                <Card className="transition-all duration-200 hover:border-slate-300 hover:shadow-sm hover:bg-slate-50">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-slate-900">{company.name}</h3>
                        {!company.isActive && (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-500">Inactive</Badge>
                        )}
                        <TaxBadge regime={company.taxRegime} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          <CountryDisplay country={company.country} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-400">Currency:</span>
                          <span className="font-mono text-xs">{company.currency}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </CardContent>
                </Card>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
