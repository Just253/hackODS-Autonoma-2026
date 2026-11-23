import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { NUEVA_SOLICITUD_DEMO } from './fixtures';
import { SolicitudPantalla } from './SolicitudPantalla';

afterEach(cleanup);

function montar() {
  return render(<SolicitudPantalla nueva={NUEVA_SOLICITUD_DEMO} ahora="2026-11-23T10:00:00.000Z" />);
}

describe('SolicitudPantalla', () => {
  it('muestra el pedido de 20 kg de arroz y el estado pendiente', () => {
    montar();
    expect(screen.getByText(/20 kg de arroz/i)).toBeInTheDocument();
    expect(screen.getByText(/Pendiente/i)).toBeInTheDocument();
  });

  it('enviar mueve el estado a Enviada, sin registrar movimiento', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
    expect(screen.getByText(/Enviada/i)).toBeInTheDocument();
    expect(screen.queryByText(/entregó/i)).not.toBeInTheDocument();
  });

  it('aprobar desde enviada deja Aprobada, sin movimiento', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Aprobar/i }));
    expect(screen.getByText(/Aprobada/i)).toBeInTheDocument();
    expect(screen.queryByText(/entregó/i)).not.toBeInTheDocument();
  });

  it('entregar tras aprobar muestra el par de transferencia (no mueve stock sola)', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Aprobar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Entregar/i }));
    expect(screen.getByText(/Entregada/i)).toBeInTheDocument();
    // Las dos ollas por su título público, con la cantidad: quién entregó y quién recibió.
    expect(screen.getByText(/Olla Norte entregó 20 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Olla Centro recibió 20 kg/)).toBeInTheDocument();
  });

  it('no se puede aprobar sin enviar: el boton esta deshabilitado', () => {
    montar();
    expect(screen.getByRole('button', { name: /Aprobar/i })).toBeDisabled();
  });

  it('no se puede entregar sin aprobar: el boton esta deshabilitado', () => {
    montar();
    expect(screen.getByRole('button', { name: /Entregar/i })).toBeDisabled();
  });

  it('cancelar desde pendiente deja el estado Cancelada', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.getByText(/Cancelada/i)).toBeInTheDocument();
  });
});
