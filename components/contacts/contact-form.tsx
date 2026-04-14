"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CompanyOption = {
  id: string;
  name: string;
};

type ContactFormData = {
  id?: string;
  companyId: string;
  fullName: string;
  position: string;
  email: string;
  phone: string;
  whatsapp: string;
  telegram: string;
  notes: string;
};

export function ContactForm({
  companies,
  initialData,
  redirectTo = "/contacts"
}: {
  companies: CompanyOption[];
  initialData?: ContactFormData;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ContactFormData>(
    initialData || {
      companyId: companies[0]?.id || "",
      fullName: "",
      position: "",
      email: "",
      phone: "",
      whatsapp: "",
      telegram: "",
      notes: ""
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!form.companyId) {
      setError("Please select a company");
      return;
    }

    try {
      setLoading(true);
      const endpoint = form.id ? `/api/contacts/${form.id}` : "/api/contacts";
      const method = form.id ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to save contact");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save contact");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-5 shadow-card">
      <FormGrid>
        <FormField label="Company" htmlFor="companyId" required>
          <Select id="companyId" value={form.companyId} onChange={(event) => update("companyId", event.target.value)}>
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Full Name" htmlFor="fullName" required>
          <Input
            id="fullName"
            value={form.fullName}
            onChange={(event) => update("fullName", event.target.value)}
            placeholder="Nurlan Akhmetov"
            required
          />
        </FormField>
        <FormField label="Position" htmlFor="position">
          <Input
            id="position"
            value={form.position}
            onChange={(event) => update("position", event.target.value)}
            placeholder="Head of Procurement"
          />
        </FormField>
        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            placeholder="person@company.com"
          />
        </FormField>
        <FormField label="Phone" htmlFor="phone">
          <Input
            id="phone"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            placeholder="+7..."
          />
        </FormField>
        <FormField label="WhatsApp" htmlFor="whatsapp">
          <Input
            id="whatsapp"
            value={form.whatsapp}
            onChange={(event) => update("whatsapp", event.target.value)}
            placeholder="+971..."
          />
        </FormField>
        <FormField label="Telegram" htmlFor="telegram">
          <Input
            id="telegram"
            value={form.telegram}
            onChange={(event) => update("telegram", event.target.value)}
            placeholder="@username"
          />
        </FormField>
      </FormGrid>

      <FormField label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          rows={5}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Communication style, timezone, decision maker notes"
        />
      </FormField>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : form.id ? "Update Contact" : "Create Contact"}
      </Button>
    </form>
  );
}
