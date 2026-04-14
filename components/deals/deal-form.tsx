"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DealStage } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ProductOption = { id: string; name: string };
type CompanyOption = { id: string; name: string };
type LeadOption = { id: string; title: string };

type DealFormData = {
  id?: string;
  productId: string;
  sourceLeadId: string;
  sellerCompanyId: string;
  buyerCompanyId: string;
  volume: string;
  unit: string;
  price: string;
  currency: string;
  incoterms: string;
  originCountry: string;
  destinationCountry: string;
  stage: DealStage;
  notes: string;
};

export function DealForm({
  products,
  companies,
  leads,
  initialData,
  redirectTo = "/deals"
}: {
  products: ProductOption[];
  companies: CompanyOption[];
  leads: LeadOption[];
  initialData?: DealFormData;
  redirectTo?: string;
}) {
  const router = useRouter();

  const [form, setForm] = useState<DealFormData>(
    initialData || {
      productId: products[0]?.id || "",
      sourceLeadId: "",
      sellerCompanyId: "",
      buyerCompanyId: "",
      volume: "",
      unit: "MT",
      price: "",
      currency: "USD",
      incoterms: "",
      originCountry: "",
      destinationCountry: "",
      stage: "DRAFT",
      notes: ""
    }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof DealFormData>(key: K, value: DealFormData[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      setLoading(true);
      const endpoint = form.id ? `/api/deals/${form.id}` : "/api/deals";
      const method = form.id ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sourceLeadId: form.sourceLeadId || null,
          sellerCompanyId: form.sellerCompanyId || null,
          buyerCompanyId: form.buyerCompanyId || null
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to save deal");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save deal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-5 shadow-card">
      <FormGrid>
        <FormField label="Product" htmlFor="productId" required>
          <Select id="productId" value={form.productId} onChange={(e) => update("productId", e.target.value)}>
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Source Lead" htmlFor="sourceLeadId">
          <Select id="sourceLeadId" value={form.sourceLeadId} onChange={(e) => update("sourceLeadId", e.target.value)}>
            <option value="">None</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.title}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Seller" htmlFor="sellerCompanyId">
          <Select
            id="sellerCompanyId"
            value={form.sellerCompanyId}
            onChange={(e) => update("sellerCompanyId", e.target.value)}
          >
            <option value="">Unspecified</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Buyer" htmlFor="buyerCompanyId">
          <Select
            id="buyerCompanyId"
            value={form.buyerCompanyId}
            onChange={(e) => update("buyerCompanyId", e.target.value)}
          >
            <option value="">Unspecified</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Volume" htmlFor="volume">
          <Input id="volume" value={form.volume} onChange={(e) => update("volume", e.target.value)} />
        </FormField>
        <FormField label="Unit" htmlFor="unit">
          <Input id="unit" value={form.unit} onChange={(e) => update("unit", e.target.value)} />
        </FormField>
        <FormField label="Price" htmlFor="price">
          <Input id="price" value={form.price} onChange={(e) => update("price", e.target.value)} />
        </FormField>
        <FormField label="Currency" htmlFor="currency">
          <Input id="currency" value={form.currency} onChange={(e) => update("currency", e.target.value)} />
        </FormField>
        <FormField label="Incoterms" htmlFor="incoterms">
          <Input id="incoterms" value={form.incoterms} onChange={(e) => update("incoterms", e.target.value)} />
        </FormField>
        <FormField label="Origin Country" htmlFor="originCountry">
          <Input
            id="originCountry"
            value={form.originCountry}
            onChange={(e) => update("originCountry", e.target.value)}
          />
        </FormField>
        <FormField label="Destination Country" htmlFor="destinationCountry">
          <Input
            id="destinationCountry"
            value={form.destinationCountry}
            onChange={(e) => update("destinationCountry", e.target.value)}
          />
        </FormField>
        <FormField label="Stage" htmlFor="stage" required>
          <Select id="stage" value={form.stage} onChange={(e) => update("stage", e.target.value as DealStage)}>
            {Object.values(DealStage).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FormField>
      </FormGrid>

      <FormField label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          rows={6}
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Counterparty constraints, payment terms, docs required, vessel schedule"
        />
      </FormField>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : form.id ? "Update Deal" : "Create Deal"}
      </Button>
    </form>
  );
}
