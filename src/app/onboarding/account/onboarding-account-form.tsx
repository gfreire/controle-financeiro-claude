"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Label, Input, FieldError } from "@/components/ui/input";
import { completeOnboardingAccount } from "../actions";

export function OnboardingAccountForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [balance, setBalance] = useState("0");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    const value = Number(balance);
    if (!Number.isFinite(value)) {
      setError("Digite um valor válido");
      return;
    }
    startTransition(async () => {
      try {
        await completeOnboardingAccount(accountId, value);
        router.push("/onboarding");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <Label>Saldo atual</Label>
        <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} autoFocus />
      </Field>
      <FieldError>{error}</FieldError>
      <Button disabled={pending} onClick={handleSubmit}>{pending ? "Salvando..." : "Continuar"}</Button>
    </div>
  );
}
