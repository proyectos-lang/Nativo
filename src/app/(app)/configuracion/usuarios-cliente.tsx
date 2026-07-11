"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarUsuario, eliminarUsuario } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { MODULOS, type Usuario, type Permisos } from "@/lib/tipos";

const PERMISOS_BASE: Permisos = {
  dashboard: true, ventas: true, pagos: true, entregas: true,
  seguimiento: true, prospectos: true, clientes: true, proveedores: false, configuracion: false, financiero: false,
};

type Form = {
  id?: number; nombre: string; usuario: string; correo: string;
  contrasena: string; rol: "admin" | "usuario"; permisos: Permisos; activo: boolean;
};

const FORM_VACIO: Form = { nombre: "", usuario: "", correo: "", contrasena: "", rol: "usuario", permisos: { ...PERMISOS_BASE }, activo: true };

export function UsuariosCliente({ usuarios, sesionId }: { usuarios: Usuario[]; sesionId: number }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Form>(FORM_VACIO);

  const abrir = (u?: Usuario) => {
    setForm(u
      ? { id: u.id, nombre: u.nombre, usuario: u.usuario, correo: u.correo || "", contrasena: "", rol: u.rol, permisos: { ...PERMISOS_BASE, ...u.permisos }, activo: u.activo }
      : { ...FORM_VACIO, permisos: { ...PERMISOS_BASE } });
    setAbierto(true);
  };

  const guardar = () => {
    startTransition(async () => {
      try {
        await guardarUsuario(form);
        toast.success(form.id ? "Usuario actualizado" : "Usuario creado");
        setAbierto(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const eliminar = (u: Usuario) => {
    if (!confirm(`¿Eliminar al usuario "${u.usuario}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      try {
        await eliminarUsuario(u.id);
        toast.success("Usuario eliminado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <Card className="mt-2">
      <CardContent className="grid gap-4 pt-2">
        <div className="flex justify-end">
          <Button onClick={() => abrir()}><UserPlus className="size-4" /> Nuevo Usuario</Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell>{u.usuario}</TableCell>
                  <TableCell><Badge variant={u.rol === "admin" ? "default" : "secondary"}>{u.rol === "admin" ? "Administrador" : "Usuario"}</Badge></TableCell>
                  <TableCell className="max-w-64 text-xs text-muted-foreground">
                    {u.rol === "admin" ? "Todos" : MODULOS.filter(m => u.permisos?.[m.clave]).map(m => m.nombre).join(", ") || "Ninguno"}
                  </TableCell>
                  <TableCell><Badge variant={u.activo ? "outline" : "destructive"}>{u.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => abrir(u)}><Pencil className="size-4" /></Button>
                    {u.id !== sesionId && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => eliminar(u)}><Trash2 className="size-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{form.id ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Usuario *</Label><Input value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Correo</Label><Input value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })} /></div>
                <div className="grid gap-1.5">
                  <Label>{form.id ? "Nueva contraseña (opcional)" : "Contraseña *"}</Label>
                  <Input type="text" value={form.contrasena} onChange={e => setForm({ ...form, contrasena: e.target.value })} placeholder={form.id ? "Dejar vacío para no cambiar" : ""} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Rol</Label>
                  <Select value={form.rol} onValueChange={v => setForm({ ...form, rol: (v as "admin" | "usuario") || "usuario" })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usuario">Usuario</SelectItem>
                      <SelectItem value="admin">Administrador (acceso total)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-end gap-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
                    Usuario activo
                  </label>
                </div>
              </div>

              {form.rol !== "admin" && (
                <div className="grid gap-2 rounded-md border p-3">
                  <p className="text-sm font-semibold">Permisos por módulo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {MODULOS.map(m => (
                      <label key={m.clave} className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={form.permisos[m.clave]}
                          onCheckedChange={v => setForm({ ...form, permisos: { ...form.permisos, [m.clave]: v } })}
                        />
                        {m.nombre}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button onClick={guardar} disabled={pendiente || !form.nombre.trim() || !form.usuario.trim()}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
