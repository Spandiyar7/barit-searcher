import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/products/product-form";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Add Product" description="Create a commodity profile with searchable synonyms" />
      <ProductForm />
    </div>
  );
}
