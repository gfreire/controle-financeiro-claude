"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "../actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wallet2 } from "lucide-react";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <Card className="gap-4">
      <div className="flex items-center gap-2">
        <Wallet2 className="size-6 text-accent" strokeWidth={1.5} />
        <CardTitle>Entrar</CardTitle>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <Field>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field>
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <FieldError>{state?.error}</FieldError>
        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <p className="text-center text-xs text-text/60">
        Não tem conta?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Criar conta
        </Link>
      </p>
    </Card>
  );
}
