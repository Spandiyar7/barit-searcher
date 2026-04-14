"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyStatus, CompanyType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CompanyFormData = {
  id?: string;
  name: string;
  companyType: CompanyType;
  country: string;
  city: string;
  website: string;
  description: string;
  source: string;
  status: CompanyStatus;
};

export function CompanyForm({
  initialData,
  redirectTo = "/companies"
}: {
  initialData?: CompanyFormData;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CompanyFormData>(
    initialData || {
      name: "",
      companyType: "BUYER",
      country: "",
      city: "",
      website: "",
      description: "",
      source: "",
      status: "ACTIVE"
    }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CompanyFormData>(key: K, value: CompanyFormData[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      setLoading(true);
      const endpoint = form.id ? `/api/companies/${form.id}` : "/api/companies";
      const method = form.id ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to save company");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-5 shadow-card">
      <FormGrid>
        <FormField label="Company Name" htmlFor="name" required>
          <Input
            id="name"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Anatolia Commodities FZE"
            required
          />
        </FormField>
        <FormField label="Company Type" htmlFor="companyType" required>
          <Select
            id="companyType"
            value={form.companyType}
            onChange={(event) => update("companyType", event.target.value as CompanyType)}
          >
            {Object.values(CompanyType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Country" htmlFor="country" required>
          <Input
            id="country"
            value={form.country}
            onChange={(event) => update("country", event.target.value)}
            placeholder="UAE"
            required
          />
        </FormField>
        <FormField label="City" htmlFor="city" required>
          <Input
            id="city"
            value={form.city}
            onChange={(event) => update("city", event.target.value)}
            placeholder="Dubai"
            required
          />
        </FormField>
        <FormField label="Website" htmlFor="website">
          <Input
            id="website"
            type="url"
            value={form.website}
            onChange={(event) => update("website", event.target.value)}
            placeholder="https://..."
          />
        </FormField>
        <FormField label="Source" htmlFor="source">
          <Input
            id="source"
            value={form.source}
            onChange={(event) => update("source", event.target.value)}
            placeholder="Exhibition / Referral / Website"
          />
        </FormField>
        <FormField label="Status" htmlFor="status" required>
          <Select
            id="status"
            value={form.status}
            onChange={(event) => update("status", event.target.value as CompanyStatus)}
          >
            {Object.values(CompanyStatus).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FormField>
      </FormGrid>

      <FormField label="Description" htmlFor="description">
        <Textarea
          id="description"
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          rows={5}
          placeholder="Main products, payment terms, reliability signals, logistics notes"
        />
      </FormField>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : form.id ? "Update Company" : "Create Company"}
        </Button>
      </div>
    </form>
  );
}
