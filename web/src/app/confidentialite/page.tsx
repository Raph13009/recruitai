import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata = {
  title: "Données et confidentialité",
  description: "Ce que RecruitAI conserve, ce qu’il ne conserve pas, et qui y a accès.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Ce qui est conservé",
    body: [
      "Le texte de la conversation entre le candidat et l’intervieweur IA, et les informations déclarées par le candidat (expérience, disponibilité, créneau, attente salariale, questions), avec ses propres mots.",
      "Un repère interne choisi par le recruteur pour retrouver l’entretien. Le nom complet n’est pas nécessaire.",
    ],
  },
  {
    title: "Ce qui n’est pas conservé",
    body: [
      "L’audio et la vidéo de l’entretien ne sont pas enregistrés par RecruitAI.",
      "La caméra du candidat, facultative, ne sert qu’à son propre aperçu : l’image reste sur son appareil, elle n’est ni transmise ni analysée.",
    ],
  },
  {
    title: "Services qui traitent la conversation",
    body: [
      "Pendant l’appel, la voix du candidat est envoyée en temps réel à Google (Gemini Live) pour produire les réponses vocales de l’intervieweur.",
      "Quand la visio avec avatar est activée, la voix de l’intervieweur est envoyée à LiveAvatar (HeyGen) qui génère la vidéo du visage synchronisé. La voix du candidat n’est pas envoyée à ce service.",
      "Les clés d’accès à ces services restent sur le serveur ; le navigateur ne reçoit que des jetons de courte durée.",
    ],
  },
  {
    title: "Ce que l’IA ne fait pas",
    body: [
      "Elle ne note pas, ne classe pas, ne compare pas les candidats et ne prend aucune décision. Les champs de score, de classement et de recommandation sont vides par conception.",
      "Elle ne pose pas de question sur l’âge, l’origine, la santé, la situation familiale ou les papiers.",
      "Elle se présente comme une IA, et le dit si on lui demande.",
    ],
  },
  {
    title: "Accès et suppression",
    body: [
      "Seuls les recruteurs de l’agence qui a envoyé le lien voient le compte rendu.",
      "Un entretien peut être supprimé définitivement depuis l’espace recruteur, transcription et compte rendu compris. Le candidat peut le demander à l’agence.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-10 sm:px-6">
        <p className="eyebrow">Confidentialité</p>
        <h1 className="display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Vos données, en clair.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Ce que RecruitAI conserve pendant un entretien, ce qu’il ne conserve pas, et qui y a accès.
        </p>
        <div className="mt-12 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-12 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Version MVP : cette page décrit le fonctionnement du logiciel. Elle ne remplace pas la politique de
          confidentialité et le registre de traitement que l’agence doit tenir avant un usage avec de vrais candidats.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
