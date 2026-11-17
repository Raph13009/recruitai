import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: {
    default: "RecruitAI · Le premier entretien en visio, mené par une IA",
    template: "%s · RecruitAI",
  },
  description:
    "Une intervieweuse IA mène le premier entretien en visio, avec un visage et une voix qui réagissent en temps réel. Votre équipe lit un compte rendu factuel. Aucun score, aucune décision automatique.",
};

export const viewport: Viewport = {
  themeColor: "#f2efe9",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
