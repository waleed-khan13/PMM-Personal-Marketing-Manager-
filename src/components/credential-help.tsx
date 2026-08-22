import { ExternalLink, KeyRound } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CredentialAction = {
  href: string;
  label: string;
};

type CredentialHelpProps = {
  description: string;
  primary: CredentialAction;
  secondary?: CredentialAction;
};

export function CredentialHelp({ description, primary, secondary }: CredentialHelpProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-800 bg-black/70 p-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <KeyRound aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
        <p className="text-[10px] leading-4 text-zinc-500">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <a
          className={cn(buttonVariants({ size: "xs", variant: "outline" }), "text-zinc-300")}
          href={primary.href}
          rel="noreferrer"
          target="_blank"
        >
          {primary.label}<ExternalLink aria-hidden="true" />
        </a>
        {secondary ? (
          <a
            className={cn(buttonVariants({ size: "xs", variant: "ghost" }), "text-zinc-500")}
            href={secondary.href}
            rel="noreferrer"
            target="_blank"
          >
            {secondary.label}<ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
