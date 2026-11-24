import React from "react";
import { Composition } from "remotion";
import { AdComposition, type AdProps } from "./AdComposition";
import { emptyProject } from "./defaults";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Ad"
    component={AdComposition}
    defaultProps={{ project: emptyProject("9:16", 10) } satisfies AdProps}
    durationInFrames={300}
    fps={30}
    width={1080}
    height={1920}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, props.project.durationInFrames),
      fps: props.project.fps,
      width: props.project.width,
      height: props.project.height,
    })}
  />
);
