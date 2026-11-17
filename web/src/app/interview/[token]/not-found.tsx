import { LinkIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function InterviewNotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Brand href={null} />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LinkIcon />
            </EmptyMedia>
            <EmptyTitle className="display text-2xl font-semibold">Ce lien d’entretien n’est pas valide</EmptyTitle>
            <EmptyDescription>
              Vérifiez que vous avez copié le lien en entier. S’il a expiré ou a été supprimé, demandez-en un nouveau à
              l’agence qui vous l’a envoyé.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    </div>
  );
}
