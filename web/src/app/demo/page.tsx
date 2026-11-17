import { redirect } from "next/navigation";

// Cookie + session creation happen in the Route Handler so they stick on Vercel.
export default function DemoPage() {
  redirect("/api/demo/start");
}
