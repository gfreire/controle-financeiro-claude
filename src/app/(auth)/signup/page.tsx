"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "../actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wallet2 } from "lucide-react";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUp, undefined);

  return (
    <Card className="gap-4">
      <div className="flex items-center gap-2">
        <Wallet2 className="size-6 text-accent" strokeWidth={1.5} />
        <CardTitle>Criar conta</CardTitle>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <Field>
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" type="text" autoComplete="name" required />
        </Field>
        <Field>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field>
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={6} required />
        </Field>
        <FieldError>{state?.error}</FieldError>
        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Criando..." : "Criar conta"}
        </Button>
      </form>
      <p className="text-center text-xs text-text/60">
        Já tem conta?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
