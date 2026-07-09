import { requiereSesion } from "@/lib/sesion";
import { clientesTodos } from "@/lib/consultas";
import { ClientesCliente } from "./clientes-cliente";
import type { Cliente } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaClientes() {
  await requiereSesion();
  const clientes = await clientesTodos();
  return <ClientesCliente clientes={clientes as Cliente[]} />;
}
