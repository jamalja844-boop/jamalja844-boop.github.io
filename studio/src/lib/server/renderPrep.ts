// Prepares a project for headless rendering: rewrites relative media URLs to signed absolute URLs.
import type { Clip, ProjectDoc } from "../../remotion/types";
import { signedAssetUrl } from "./storage";

const ID_RE = /\/api\/files\/(med_[A-Za-z0-9_-]+)/;

export function prepareForRender(doc: ProjectDoc): ProjectDoc {
  const copy: ProjectDoc = JSON.parse(JSON.stringify(doc));
  for (const track of copy.tracks) {
    for (const clip of track.clips as Clip[]) {
      const p = clip.props as unknown as Record<string, unknown>;
      if (typeof p.src === "string" && p.src) {
        const id = (p.assetId as string) || p.src.match(ID_RE)?.[1];
        if (id) p.src = signedAssetUrl(id);
        else if (p.src.startsWith("/")) p.src = `${process.env.APP_URL || "http://localhost:3000"}${p.src}`;
      }
    }
  }
  return copy;
}
