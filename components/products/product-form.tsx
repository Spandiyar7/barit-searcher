"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ProductFormData = {
  id?: string;
  name: string;
  category: string;
  synonyms: string;
  hsCode: string;
  specsJson: string;
};

export function ProductForm({
  initialData,
  redirectTo = "/products"
}: {
  initialData?: ProductFormData;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProductFormData>(
    initialData || {
      name: "",
      category: "Industrial Minerals",
      synonyms: "",
      hsCode: "",
      specsJson: ""
    }
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const synonymsList = useMemo(
    () =>
      form.synonyms
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [form.synonyms]
  );

  const update = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      setLoading(true);
      const endpoint = form.id ? `/api/products/${form.id}` : "/api/products";
      const method = form.id ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          synonyms: synonymsList
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to save product");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-white p-5 shadow-card">
      <FormGrid>
        <FormField label="Product Name" htmlFor="name" required>
          <Input
            id="name"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Barite"
            required
          />
        </FormField>
        <FormField label="Category" htmlFor="category" required>
          <Input
            id="category"
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
            placeholder="Fertilizers / Polymers / Grains"
            required
          />
        </FormField>
        <FormField label="HS Code" htmlFor="hsCode">
          <Input
            id="hsCode"
            value={form.hsCode}
            onChange={(event) => update("hsCode", event.target.value)}
            placeholder="251110"
          />
        </FormField>
        <FormField label="Synonyms (comma separated)" htmlFor="synonyms">
          <Input
            id="synonyms"
            value={form.synonyms}
            onChange={(event) => update("synonyms", event.target.value)}
            placeholder="Barium sulfate, Drilling grade barite"
          />
        </FormField>
      </FormGrid>

      <FormField label="Specs JSON" htmlFor="specsJson">
        <Textarea
          id="specsJson"
          rows={8}
          value={form.specsJson}
          onChange={(event) => update("specsJson", event.target.value)}
          placeholder='{"BaSO4": "90% min", "SG": "4.2 min", "mesh": "200"}'
        />
      </FormField>

      {synonymsList.length > 0 ? (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Parsed synonyms: {synonymsList.join(" | ")}
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : form.id ? "Update Product" : "Create Product"}
      </Button>
    </form>
  );
}
