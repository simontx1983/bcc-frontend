/**
 * /blog/new — long-form authoring route.
 *
 * Server component shell that renders the BlogForm (lifted from the
 * v1.5 inline composer rewrite — see Composer.tsx) on its own page
 * with simple chrome.
 *
 * Why a route, not a tab/modal: per the v1.5 product call, long-form
 * is an *escalation path*, not a parallel mode. A user graduating
 * from a quick status post to a multi-paragraph essay benefits from
 * a different mindset and visual context — full-page authoring
 * surface, no Floor distractions, distinct chrome.
 *
 * Auth: required. Anonymous visitors get redirected to the home page;
 * the inline status composer + FloorIntro live there for them.
 *
 * Submit success: BlogForm calls the optional `onSubmitSuccess`
 * callback. We use it to client-route to the user's blog tab so they
 * can confirm their post landed. Server-rendered redirect would lose
 * the post-submit cache invalidation `useCreatePostMutation` does
 * inside BlogForm; client navigation preserves it.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { BlogNewClient } from "./BlogNewClient";

export const metadata = {
  title: "New blog post — Blue Collar Crypto",
};

export default async function NewBlogPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/");
  }

  return <BlogNewClient handle={session.user.handle} />;
}
