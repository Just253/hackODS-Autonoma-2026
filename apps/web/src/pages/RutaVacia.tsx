export interface RutaVaciaProps {
  readonly titulo: string;
  readonly dueno: 'B' | 'C';
}

export function RutaVacia({ titulo, dueno }: RutaVaciaProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-2xl font-bold">{titulo}</h2>
      <p className="rounded-lg border border-gray-300 bg-gray-50 p-4">
        Pantalla pendiente. La implementa el track {dueno}.
      </p>
    </section>
  );
}
