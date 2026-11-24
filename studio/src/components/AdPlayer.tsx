"use client";
import React, { forwardRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { AdComposition } from "@/remotion/AdComposition";
import type { ProjectDoc } from "@/remotion/types";

export const AdPlayer = forwardRef<PlayerRef, { project: ProjectDoc; hiddenClipIds?: string[]; controls?: boolean; autoPlay?: boolean; loop?: boolean; style?: React.CSSProperties; className?: string }>(function AdPlayer({ project, hiddenClipIds, controls = true, autoPlay, loop = true, style, className }, ref) {
  return (
    <Player
      ref={ref}
      component={AdComposition}
      inputProps={{ project, hiddenClipIds }}
      durationInFrames={Math.max(1, project.durationInFrames)}
      fps={project.fps}
      compositionWidth={project.width}
      compositionHeight={project.height}
      controls={controls}
      autoPlay={autoPlay}
      loop={loop}
      acknowledgeRemotionLicense
      style={{ width: "100%", aspectRatio: `${project.width} / ${project.height}`, ...style }}
      className={className}
    />
  );
});
