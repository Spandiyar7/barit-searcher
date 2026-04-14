import { notFound } from "next/navigation";
import { getProductById } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/products/product-form";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${product.name}`} description="Update commodity settings" />
      <ProductForm
        initialData={{
          id: product.id,
          name: product.name,
          category: product.category,
          synonyms: product.synonyms.join(", "),
          hsCode: product.hsCode || "",
          specsJson: product.specsJson ? JSON.stringify(product.specsJson, null, 2) : ""
        }}
      />
    </div>
  );
}
