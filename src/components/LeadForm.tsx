import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Property } from "@/data/properties";
import { propertyTitle } from "@/lib/format";
import { PropBot } from "@/components/PropBot";
import { setStoredLead } from "@/lib/leadStore";

const leadSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, { message: "Ingresá tu nombre" })
    .max(80, { message: "Nombre demasiado largo" }),
  telefono: z
    .string()
    .trim()
    .min(6, { message: "Ingresá un teléfono válido" })
    .max(25, { message: "Teléfono demasiado largo" })
    .regex(/^[0-9+()\s-]+$/, { message: "Teléfono inválido" }),
  email: z
    .string()
    .trim()
    .email({ message: "Email inválido" })
    .max(255, { message: "Email demasiado largo" }),
  mensaje: z
    .string()
    .trim()
    .max(600, { message: "El mensaje es demasiado largo" })
    .optional(),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof leadSchema>, string>>;

export function LeadForm({ property }: { property: Property }) {
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    mensaje: `Hola, me interesa ${propertyTitle(
      property.tipo,
      property.barrio,
      property.dormitorios,
    )} (#${property.id}). Me gustaría recibir más información.`,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = leadSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    // Guardamos el lead para reutilizarlo en otras propiedades sin volver a
    // pedir el formulario, y lo entregamos al asistente del chat (PropBot).
    setStoredLead({
      nombre: form.nombre,
      telefono: form.telefono,
      email: form.email,
      mensaje: form.mensaje,
    });
    setSubmitted(true);
    toast.success("¡Listo! Recibimos tus datos", {
      description: "Nuestro asistente se va a contactar contigo en breve.",
    });
  }

  if (submitted) {
    return (
      <PropBot
        property={property}
        lead={{
          nombre: form.nombre,
          telefono: form.telefono,
          email: form.email,
          mensaje: form.mensaje,
        }}
      />
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-6 shadow-card"
      noValidate
    >
      <h3 className="text-lg font-bold text-foreground">
        ¿Te interesa esta propiedad?
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Dejanos tus datos y te contactamos para darte toda la información.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <Label htmlFor="nombre">Nombre completo</Label>
          <Input
            id="nombre"
            value={form.nombre}
            onChange={(e) => update("nombre", e.target.value)}
            placeholder="Tu nombre"
            className="mt-1.5"
            maxLength={80}
          />
          {errors.nombre && (
            <p className="mt-1 text-xs text-destructive">{errors.nombre}</p>
          )}
        </div>

        <div>
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            type="tel"
            value={form.telefono}
            onChange={(e) => update("telefono", e.target.value)}
            placeholder="099 123 456"
            className="mt-1.5"
            maxLength={25}
          />
          {errors.telefono && (
            <p className="mt-1 text-xs text-destructive">{errors.telefono}</p>
          )}
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="tu@email.com"
            className="mt-1.5"
            maxLength={255}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-destructive">{errors.email}</p>
          )}
        </div>

        <div>
          <Label htmlFor="mensaje">Mensaje (opcional)</Label>
          <Textarea
            id="mensaje"
            value={form.mensaje}
            onChange={(e) => update("mensaje", e.target.value)}
            className="mt-1.5 min-h-[90px]"
            maxLength={600}
          />
          {errors.mensaje && (
            <p className="mt-1 text-xs text-destructive">{errors.mensaje}</p>
          )}
        </div>
      </div>

      <Button type="submit" className="mt-5 w-full gap-2" size="lg">
        <Send size={18} /> Quiero que me contacten
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Al enviar, nuestro asistente se comunicará contigo automáticamente.
      </p>
    </form>
  );
}
